"""
core/grok_agent.py — xAI Grok agent with async streaming, tool use, and memory.

Architecture (v4 — speed-optimized):
  - Async streaming via httpx with HTTP/2 + keep-alive
  - xAI prompt caching via x-grok-conv-id header (reuses KV cache across turns)
  - API key round-robin for multi-key load distribution
  - Append-only message history (never reorder — required for cache hits)
  - Persistent user memory extracted via Grok
  - 20-message context window
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import itertools
from datetime import datetime
from typing import Any, AsyncGenerator

import httpx

from config import XAI_API_KEY, XAI_API_KEYS, GROK_MODEL
from core.canonical_tools import build_reprompt_note
from core.system_prompt import get_system_prompt
from core.orryon_brand import (
    normalize_orryon_in_assistant_reply,
    user_likely_addressing_orryon,
)
from core.user_locale import get_user_locale
from core.context_cache import (
    get_context_snapshot_text,
    invalidate_context_cache,
    schedule_context_refresh,
)
from core.tool_labels import get_tool_label
from core.canonical_tools import filter_schemas_for_grok
from core.tools import GROK_TOOL_SCHEMAS, TOOL_SCHEMAS, execute_tool
from db import fetch_rows

logger = logging.getLogger(__name__)

XAI_API_URL = "https://api.x.ai/v1/chat/completions"
MAX_TOOL_ROUNDS = 8
HISTORY_WINDOW = 20

CHAT_TEMPERATURE = 0.7
CHAT_MAX_TOKENS = 2048

# ── Soft re-prompt: "no tool called but one was obviously needed" detector ───
# When Grok finishes a turn without calling any tool AND the user message
# clearly required one (action verb present) AND the assistant prose is not
# itself a clarifying question, we append a single system correction and
# re-stream exactly once. Capped at one retry per turn to prevent loops.
_ACTION_VERB_RE = re.compile(
    r"\b("
    r"spent|bought|paid|grabbed|picked|dropped|cost|"
    r"log|logged|logging|add|adding|added|"
    r"remind|save|saved|saving|schedule|booked|book|booking|"
    r"create|created|set|update|updated|"
    r"edit|editing|change|changed|rename|renamed|modify|modified|fix|bump|"
    r"delete|deleted|remove|removed|cancel|cancelled|canceled|"
    r"complete|completed|finish|finished|mark|marked|check|checked|"
    r"pin|unpin|"
    r"show|pull|list|find|search|"
    r"news|headlines|headline|breaking|happening|current events|"
    r"in the news|what'?s new|"
    r"how\s+much|how\s+many|what'?s\s+my|what\s+are\s+my|"
    r"forecast|insights?|yearly|summary|afford|trend|pattern|analyze|analyse"
    r")\b",
    re.IGNORECASE,
)

_TRAILING_QUESTION_RE = re.compile(r"\?\s*$")

# News/current-events questions are answered via server-side web_search/x_search —
# no Orryon client tool is required, so never soft-re-prompt into Life OS tools.
_LIVE_NEWS_QUERY_RE = re.compile(
    r"\b("
    r"news|headlines|headline|breaking(?:\s+news)?|current events|"
    r"in the news|what'?s new|what(?:'s| is) (?:in )?the news|"
    r"what happened today|happening (?:in the world|today)|"
    r"tell me.*\bnews\b"
    r")\b",
    re.IGNORECASE,
)

_REPROMPT_SYSTEM_NOTE = build_reprompt_note()


def _needs_tool_reprompt(
    user_msg: str,
    tool_calls: list,
    assistant_text: str,
) -> bool:
    """True iff the first pass should be retried with a corrective nudge."""
    if tool_calls:
        return False
    if not user_msg or not _ACTION_VERB_RE.search(user_msg):
        return False
    if _LIVE_NEWS_QUERY_RE.search(user_msg):
        return False
    text = (assistant_text or "").strip()
    if not text:
        # Empty assistant reply almost always means Grok bailed — do retry.
        return True
    last_nonempty = [ln for ln in text.splitlines() if ln.strip()]
    if last_nonempty and _TRAILING_QUESTION_RE.search(last_nonempty[-1]):
        return False  # assistant IS asking a question — that's valid
    return True

# ── API key round-robin ───────────────────────────────────────────────────────
_all_keys = [k for k in XAI_API_KEYS if k] if XAI_API_KEYS else ([XAI_API_KEY] if XAI_API_KEY else [])
_key_cycle = itertools.cycle(_all_keys) if _all_keys else None


def _next_api_key() -> str:
    if _key_cycle:
        return next(_key_cycle)
    return XAI_API_KEY


# ── Shared async client (created once, reused across requests) ────────────────
# Aggressive connect timeout (5s) to fail fast; generous read timeout for long
# streaming responses. Keep-alive reuses TCP connections across requests.
_http_client: httpx.AsyncClient | None = None


def get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(90.0, connect=5.0),
            limits=httpx.Limits(max_keepalive_connections=10, max_connections=20),
        )
    return _http_client


async def close_http_client() -> None:
    global _http_client
    if _http_client and not _http_client.is_closed:
        await _http_client.aclose()
        _http_client = None


_UNDO_TABLE_MAP = {
    # Write tools that support undo
    "log_expense": "transactions",
    "log_bill": "subscriptions",
    "add_calendar_event": "events",
    "add_note": "notes",
    "log_journal_entry": "notes",
    "create_goal": "goals",
    "update_goal": "goals",

    # Legacy aliases
    "add_expense": "transactions",
    "add_recurring_bill": "subscriptions",
    "add_goal": "goals",
    "update_goal_progress": "goals",

    # Orphan write tools
    "add_task": "action_items",
    "add_recurring_income": "recurring_income",
    "split_expense": "transactions",
}


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC API
# ─────────────────────────────────────────────────────────────────────────────

async def run_orryon(
    user_message: str,
    user_id: str,
    chat_history: list[dict] | None = None,
    user_name: str = "there",
    session_id: str = "",
) -> dict:
    """Non-streaming entrypoint — collects the full response from the async stream."""
    if not _all_keys:
        return {
            "message": (
                "AI API key not set. Add `XAI_API_KEY=your_key` to `.env`."
            ),
            "actions_taken": [],
            "tabs_to_refresh": [],
            "error": "XAI_API_KEY not set",
            "undo_info": None,
        }

    full_text = ""
    result: dict = {
        "message": "", "actions_taken": [], "tabs_to_refresh": [],
        "error": None, "undo_info": None,
    }

    async for event in run_orryon_stream(user_message, user_id, chat_history, user_name, session_id):
        if event["type"] == "token":
            full_text += event["content"]
        elif event["type"] == "done":
            result = {
                "message": event.get("message", full_text),
                "actions_taken": event.get("actions", []),
                "tabs_to_refresh": event.get("tabs", []),
                "error": None,
                "undo_info": event.get("undo_info"),
            }
        elif event["type"] == "error":
            result = {
                "message": event["message"],
                "actions_taken": [], "tabs_to_refresh": [],
                "error": event["message"], "undo_info": None,
            }

    if not result["message"] and full_text:
        result["message"] = full_text
    return result


async def run_orryon_stream(
    user_message: str,
    user_id: str,
    chat_history: list[dict] | None = None,
    user_name: str = "there",
    session_id: str = "",
    tier: str = "pro",
    mode: str = "adult",
    live_orryon: bool = True,
) -> AsyncGenerator[dict, None]:
    """
    Async streaming generator that yields events as orryon processes a message.

    Event types:
        {"type": "token",  "content": "partial text..."}
        {"type": "tool",   "name": "log_expense", "label": "Logging expense"}
        {"type": "retry",  "reason": "no_tool_called"}
        {"type": "done",   "message": "...", "actions": [...], "tabs": [...]}
        {"type": "error",  "message": "..."}

    session_id is forwarded as x-grok-conv-id for xAI prompt caching.
    """
    if not _all_keys:
        yield {"type": "error", "message": "Orryon's AI is not configured. Please try again later."}
        return

    locale = get_user_locale(user_id)
    brand_hint = ""
    if user_likely_addressing_orryon(user_message):
        brand_hint = (
            "\nNOTE: The user may have said Oriana, Orion, or Orryon (e.g. voice transcription). "
            "They mean you — orryon. Reply using orryon; do not mirror the misspelling.\n"
        )
    system_prompt = get_system_prompt(
        user_name=user_name,
        tier=tier,
        mode=mode,
        live_orryon=live_orryon,
        locale_block=locale.prompt_block() + brand_hint,
    )
    grok_tools = filter_schemas_for_grok(TOOL_SCHEMAS, live_orryon=live_orryon)
    use_agent_tools = live_orryon
    memories = _get_user_memories(user_id)
    context_snip = await get_context_snapshot_text(
        user_id, lambda: _compute_context_snapshot(user_id),
    )
    messages = _build_messages(
        system_prompt, chat_history or [], user_message, user_id, memories, context_snip,
    )

    actions_taken: list[dict] = []
    all_tabs: set[str] = set()
    last_undo_info: dict | None = None
    accumulated_usage: dict[str, int] = {"prompt_tokens": 0, "completion_tokens": 0}
    reprompted_once = False

    try:
        if use_agent_tools:
            from core.xai_responses import (
                AgentToolsUnavailable,
                chat_schemas_to_responses_tools,
                run_orryon_stream_agent,
            )

            try:
                async for event in run_orryon_stream_agent(
                    user_message=user_message,
                    user_id=user_id,
                    messages=messages,
                    responses_tools=chat_schemas_to_responses_tools(grok_tools),
                    session_id=session_id,
                    api_key=_next_api_key(),
                    reprompt_note=_REPROMPT_SYSTEM_NOTE,
                    max_rounds=MAX_TOOL_ROUNDS,
                ):
                    yield event
                return
            except AgentToolsUnavailable:
                logger.warning(
                    "Agent Tools unavailable for user_id=%s — using chat completions + RSS news",
                    user_id,
                )

        for _round in range(MAX_TOOL_ROUNDS):
            content_parts: list[str] = []
            tool_calls_buf: list[dict] = []

            async for chunk in _call_grok_stream(
                messages, session_id=session_id, tools=grok_tools,
            ):
                if chunk.get("usage"):
                    u = chunk["usage"]
                    accumulated_usage["prompt_tokens"] += u.get("prompt_tokens", 0)
                    accumulated_usage["completion_tokens"] += u.get("completion_tokens", 0)

                choices = chunk.get("choices")
                if not choices:
                    continue
                delta = choices[0].get("delta", {})

                if delta.get("content"):
                    content_parts.append(delta["content"])
                    yield {"type": "token", "content": delta["content"]}

                if "tool_calls" in delta:
                    for tc_delta in delta["tool_calls"]:
                        idx = tc_delta.get("index", 0)
                        while len(tool_calls_buf) <= idx:
                            tool_calls_buf.append({
                                "id": "", "type": "function",
                                "function": {"name": "", "arguments": ""},
                            })
                        if tc_delta.get("id"):
                            tool_calls_buf[idx]["id"] = tc_delta["id"]
                        fn = tc_delta.get("function", {})
                        if fn.get("name"):
                            tool_calls_buf[idx]["function"]["name"] += fn["name"]
                        if fn.get("arguments"):
                            tool_calls_buf[idx]["function"]["arguments"] += fn["arguments"]

            full_content = normalize_orryon_in_assistant_reply(
                "".join(content_parts), user_message,
            )
            assistant_msg: dict[str, Any] = {"role": "assistant", "content": full_content or None}
            if tool_calls_buf:
                assistant_msg["tool_calls"] = tool_calls_buf
            messages.append(assistant_msg)

            if not tool_calls_buf:
                # Safety net: if the user clearly asked for an action and Grok
                # produced no tool call and no clarifying question, nudge it
                # once with a system correction. Capped at a single retry.
                if (not reprompted_once) and _needs_tool_reprompt(
                    user_message, tool_calls_buf, full_content
                ):
                    reprompted_once = True
                    logger.info(
                        "Soft re-prompt triggered for user_id=%s (user msg: %r)",
                        user_id, (user_message or "")[:120],
                    )
                    yield {"type": "retry", "reason": "no_tool_called"}
                    messages.append({
                        "role": "system",
                        "content": _REPROMPT_SYSTEM_NOTE,
                    })
                    continue

                _schedule_memory_extraction(user_message, full_content, user_id)
                schedule_context_refresh(
                    user_id, lambda: _compute_context_snapshot(user_id),
                )
                yield {
                    "type": "done", "message": full_content,
                    "actions": actions_taken, "tabs": list(all_tabs),
                    "undo_info": last_undo_info, "usage": accumulated_usage,
                }
                return

            for tc in tool_calls_buf:
                fn_name = tc["function"]["name"]
                label = get_tool_label(fn_name)
                yield {"type": "tool", "name": fn_name, "label": label}

                try:
                    tool_args = json.loads(tc["function"]["arguments"])
                except json.JSONDecodeError:
                    tool_args = {}

                result, tabs = execute_tool(fn_name, tool_args, user_id)
                all_tabs.update(tabs)
                if tabs:
                    invalidate_context_cache(user_id)
                actions_taken.append({"tool": fn_name, "args": tool_args, "result": result})

                if result.get("needs_confirmation"):
                    yield {
                        "type": "confirm_required",
                        "action": fn_name,
                        "message": result.get("message", "Confirmation required."),
                        "args": tool_args,
                    }

                if result.get("id") and fn_name in _UNDO_TABLE_MAP:
                    last_undo_info = {
                        "table": _UNDO_TABLE_MAP[fn_name],
                        "id": result["id"], "tool": fn_name, "label": label,
                    }

                messages.append({
                    "role": "tool", "tool_call_id": tc["id"],
                    "content": json.dumps(result),
                })

        schedule_context_refresh(user_id, lambda: _compute_context_snapshot(user_id))
        yield {
            "type": "done",
            "message": "Done! Let me know if you need anything else.",
            "actions": actions_taken, "tabs": list(all_tabs),
            "undo_info": last_undo_info, "usage": accumulated_usage,
        }

    except httpx.TimeoutException:
        logger.error("Grok API timeout")
        yield {"type": "error", "message": "Orryon is taking too long — please try again."}
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        if status == 401:
            msg = "Invalid API key. Check `XAI_API_KEY` in your `.env` file."
        elif status == 429:
            msg = "I'm getting a lot of requests right now. Give me a sec and try again."
        elif status >= 500:
            msg = "Orryon's AI is temporarily unavailable. Try again in a few seconds."
        else:
            msg = "Orryon's AI hit a snag. Try again shortly."
        logger.error("Grok HTTP error %s: %s", status, exc)
        yield {"type": "error", "message": msg}
    except Exception as exc:
        logger.error("run_orryon_stream error: %s", exc)
        yield {"type": "error", "message": f"Something went wrong: {exc}"}


# ─────────────────────────────────────────────────────────────────────────────
# API CALLS (async httpx)
# ─────────────────────────────────────────────────────────────────────────────

async def _call_grok_stream(
    messages: list[dict],
    session_id: str = "",
    tools: list[dict] | None = None,
) -> AsyncGenerator[dict, None]:
    """Async SSE streaming call to xAI Grok API. Yields parsed JSON chunks.

    Prompt caching: when session_id is provided, it's sent as x-grok-conv-id.
    xAI reuses the KV cache for the conversation prefix, cutting TTFT on
    follow-up turns by 50-80%. The only requirement is that prior messages
    in the array are never reordered or mutated — only appended to.
    """
    api_key = _next_api_key()
    headers: dict[str, str] = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json; charset=utf-8",
    }
    if session_id:
        headers["x-grok-conv-id"] = session_id

    payload: dict[str, Any] = {
        "model": GROK_MODEL,
        "messages": messages,
        "temperature": CHAT_TEMPERATURE,
        "max_tokens": CHAT_MAX_TOKENS,
        "tools": tools if tools is not None else GROK_TOOL_SCHEMAS,
        "tool_choice": "auto",
        "stream": True,
        "stream_options": {"include_usage": True},
    }

    client = get_http_client()
    async with client.stream("POST", XAI_API_URL, json=payload, headers=headers) as resp:
        resp.raise_for_status()
        async for line in resp.aiter_lines():
            if not line or not line.startswith("data: "):
                continue
            data = line[6:]
            if data.strip() == "[DONE]":
                break
            try:
                yield json.loads(data)
            except json.JSONDecodeError:
                continue


async def _call_grok_async(messages: list[dict]) -> dict:
    """Single non-streaming async call to Grok."""
    api_key = _next_api_key()
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json; charset=utf-8",
    }
    payload: dict[str, Any] = {
        "model": GROK_MODEL,
        "messages": messages,
        "temperature": 0,
        "max_tokens": 256,
    }
    client = get_http_client()
    resp = await client.post(XAI_API_URL, json=payload, headers=headers, timeout=15.0)
    resp.raise_for_status()
    return resp.json()


# ─────────────────────────────────────────────────────────────────────────────
# MESSAGE BUILDING
# ─────────────────────────────────────────────────────────────────────────────

def _build_messages(
    system_prompt: str,
    chat_history: list[dict],
    user_message: str,
    user_id: str,
    memories: list[str] | None = None,
    context_snip: str = "(context unavailable)",
) -> list[dict]:
    memory_block = ""
    if memories:
        facts = "\n".join(f"- {m}" for m in memories[:30])
        memory_block = (
            "\n\n## USER MEMORY (facts you've learned about this user)\n"
            f"{facts}\n"
            "Use these to personalize responses. Don't repeat them back unless relevant."
        )

    messages: list[dict] = [
        {
            "role": "system",
            "content": (
                system_prompt
                + f"\n\n## CURRENT USER CONTEXT\n{context_snip}"
                + memory_block
            ),
        }
    ]

    recent = [m for m in chat_history if m.get("role") in ("user", "assistant")][-HISTORY_WINDOW:]
    for m in recent:
        messages.append({"role": m["role"], "content": m.get("content") or ""})

    messages.append({"role": "user", "content": user_message})
    return messages


# ─────────────────────────────────────────────────────────────────────────────
# CONTEXT SNAPSHOT (compute body — caching in core/context_cache.py)
# ─────────────────────────────────────────────────────────────────────────────

def _compute_context_snapshot(user_id: str) -> str:
    try:
        from core.tools import (
            _get_spending_summary, _get_budget_status,
            _get_goals, _get_upcoming_schedule, _get_balance,
        )
        from db import get_total_monthly_income

        locale = get_user_locale(user_id)
        fmt = locale.format_money

        bal_data = _get_balance({}, user_id)
        spend = _get_spending_summary({"period": "this_month"}, user_id)
        budget = _get_budget_status({}, user_id)
        goals = _get_goals({}, user_id)
        schedule = _get_upcoming_schedule({"days": 7}, user_id)
        monthly_income = get_total_monthly_income(user_id)

        lines = [
            f"- Balance: {fmt(bal_data['balance'])}",
            f"- Goals earmarked: {fmt(bal_data['goals_earmarked'])}",
            f"- Free to spend (balance after goals): {fmt(bal_data['free_to_spend'])}",
            f"- Monthly income: {fmt(monthly_income)}" if monthly_income > 0 else "- Monthly income: not set",
            f"- Monthly bills: {fmt(bal_data['monthly_bills'])}",
            f"- This month's spending: {fmt(spend['total'])} ({spend['transaction_count']} transactions)",
        ]
        for cat in spend.get("by_category", [])[:3]:
            lines.append(f"  . {cat['category']}: {fmt(cat['total'])}")
        for b in budget.get("categories", [])[:3]:
            lines.append(
                f"  . Budget {b['category']}: {fmt(b['spent'])}/{fmt(b['planned'])} ({b['pct_used']}%)"
            )
        if goals.get("goals"):
            lines.append("- Goals:")
            for g in goals["goals"][:3]:
                lines.append(
                    f"  . {g['name']}: {fmt(g['current_amount'])}/{fmt(g['target_amount'])} ({g['pct_complete']}%)"
                )
        if schedule.get("items"):
            lines.append("- Upcoming (7 days):")
            for item in schedule["items"][:5]:
                amt = f" {fmt(item['amount'])}" if item.get("amount") else ""
                lines.append(f"  . [{item['type']}] {item['title']} — {item.get('date', '')}{amt}")

        try:
            from db import get_connection
            conn = get_connection()
            recent_notes = conn.execute(
                "SELECT id, title, mood, is_pinned FROM notes "
                "WHERE user_id=? ORDER BY is_pinned DESC, updated_at DESC LIMIT 5",
                (user_id,),
            ).fetchall()
            conn.close()
            if recent_notes:
                lines.append("- Recent notes:")
                for n in recent_notes:
                    n = dict(n)
                    pin = " pinned" if n.get("is_pinned") else ""
                    mood = f" ({n['mood']})" if n.get("mood") else ""
                    lines.append(f"  . [{n['id'][:8]}] {n['title']}{pin}{mood}")
        except Exception:
            pass

        return "\n".join(lines)
    except Exception as exc:
        logger.warning("Context snapshot failed: %s", exc)
        return "(context unavailable)"


# ─────────────────────────────────────────────────────────────────────────────
# PERSISTENT MEMORY
# ─────────────────────────────────────────────────────────────────────────────

def _get_user_memories(user_id: str) -> list[str]:
    try:
        from db import get_user_memories
        rows = get_user_memories(user_id, limit=30)
        return [r["fact"] for r in rows]
    except Exception:
        return []


def _schedule_memory_extraction(
    user_message: str, assistant_response: str, user_id: str,
) -> None:
    if not _all_keys or len(user_message) < 15:
        return
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(
            _extract_memories_async(user_message, assistant_response, user_id)
        )
    except RuntimeError:
        pass


async def _extract_memories_async(
    user_message: str, assistant_response: str, user_id: str,
) -> None:
    try:
        from backend.deps import get_monthly_spend_cap, get_monthly_token_cap, resolve_plan_for_user
        from db import get_monthly_spend, get_monthly_token_usage, record_token_spend, save_user_memory

        plan = resolve_plan_for_user(user_id)["plan"]
        if get_monthly_spend(user_id) >= get_monthly_spend_cap(plan):
            return
        token_usage = get_monthly_token_usage(user_id)
        if token_usage["total_tokens"] >= get_monthly_token_cap(plan):
            return

        existing = _get_user_memories(user_id)
        if len(existing) > 100:
            return

        result = await _call_grok_async([
            {
                "role": "system",
                "content": (
                    "Extract notable personal facts from this conversation that would be useful "
                    "to remember for future interactions. Only extract CONCRETE facts like: "
                    "preferences, life circumstances, financial details, names of people/pets, "
                    "habits, or goals. Return a JSON array of strings. If nothing notable, return []. "
                    "Max 3 facts per exchange. Be concise (under 15 words each)."
                ),
            },
            {
                "role": "user",
                "content": f"User said: {user_message}\nAssistant responded: {assistant_response[:500]}",
            },
        ])

        usage = result.get("usage") or {}
        pt = int(usage.get("prompt_tokens") or 0)
        ct = int(usage.get("completion_tokens") or 0)
        if pt or ct:
            record_token_spend(user_id, pt, ct)

        content = result["choices"][0]["message"]["content"].strip()
        facts = _parse_json_array(content)

        for fact in facts[:3]:
            if isinstance(fact, str) and len(fact.strip()) > 5:
                save_user_memory(user_id, fact.strip())

    except Exception as exc:
        logger.debug("Memory extraction failed (non-critical): %s", exc)


def _parse_json_array(text: str) -> list:
    text = text.strip()
    if text.startswith("["):
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass
    match = re.search(r'\[.*\]', text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return []
