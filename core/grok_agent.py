"""
core/grok_agent.py — xAI Grok agent with streaming, chain-of-thought, and memory.

Architecture (v2):
  - Streaming SSE responses for real-time token display
  - Full tool-message history (no stripping) for multi-turn accuracy
  - Persistent user memory extracted via Grok (no other LLMs)
  - 50-message context window (up from 20)
  - Undo tracking for write actions

Usage:
    # Streaming (preferred):
    from core.grok_agent import run_orryon_stream
    for event in run_orryon_stream("sushi $312 dining", user_id="abc"):
        if event["type"] == "token": print(event["content"], end="")

    # Non-streaming (backward compat):
    from core.grok_agent import run_orryon
    result = run_orryon("sushi $312 dining", user_id="abc")
"""

from __future__ import annotations

import json
import logging
import re
import threading
from datetime import datetime
from typing import Any, Generator

import requests

from config import XAI_API_KEY, GROK_MODEL
from core.system_prompt import get_system_prompt
from core.tools import TOOL_SCHEMAS, execute_tool
from db import fetch_rows

logger = logging.getLogger(__name__)

XAI_API_URL = "https://api.x.ai/v1/chat/completions"
MAX_TOOL_ROUNDS = 8
HISTORY_WINDOW = 50

_TOOL_LABELS = {
    "set_balance": "Setting balance",
    "add_money": "Adding to balance",
    "get_balance": "Checking balance",
    "add_expense": "Logging expense",
    "add_calendar_event": "Adding to calendar",
    "add_grocery_items": "Updating grocery list",
    "add_recurring_bill": "Adding recurring bill",
    "add_task": "Creating task",
    "add_note": "Saving note",
    "set_budget": "Setting budget",
    "check_grocery_item": "Checking off item",
    "complete_task": "Completing task",
    "get_spending_summary": "Checking spending",
    "get_net_worth": "Calculating net worth",
    "get_upcoming_schedule": "Loading schedule",
    "get_budget_status": "Checking budgets",
    "add_goal": "Creating goal",
    "update_goal_progress": "Updating goal",
    "get_goals": "Loading goals",
    "get_spending_recap": "Building recap",
    "add_custom_category": "Creating category",
    "get_money_left_after_goals": "Calculating free money",
    "set_notification_preferences": "Updating preferences",
    "delete_expense": "Removing expense",
    "delete_event": "Removing event",
    "delete_task": "Removing task",
    "edit_expense": "Updating expense",
    "add_recurring_income": "Tracking income",
    "edit_event": "Updating event",
    "edit_task": "Updating task",
    "delete_note": "Removing note",
    "search_notes": "Searching notes",
    "edit_note": "Updating note",
    "pin_note": "Pinning note",
    "delete_bill": "Cancelling bill",
    "split_expense": "Splitting expense",
    "get_spending_patterns": "Analysing patterns",
    "search_transactions": "Searching transactions",
}

_UNDO_TABLE_MAP = {
    "add_expense": "transactions",
    "add_calendar_event": "events",
    "add_task": "action_items",
    "add_note": "notes",
    "add_goal": "goals",
    "add_recurring_bill": "subscriptions",
    "add_recurring_income": "recurring_income",
    "split_expense": "transactions",
}


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC API
# ─────────────────────────────────────────────────────────────────────────────

def run_orryon(
    user_message: str,
    user_id: str,
    chat_history: list[dict] | None = None,
    user_name: str = "there",
) -> dict:
    """Non-streaming entrypoint — collects the full response from the stream."""
    if not XAI_API_KEY:
        return {
            "message": (
                "⚠️ **orryon needs a Grok API key to think.**\n\n"
                "Add `XAI_API_KEY=your_key` to your `.env` file, then restart.\n"
                "Get a key at [console.x.ai](https://console.x.ai) — takes 2 minutes."
            ),
            "actions_taken": [],
            "tabs_to_refresh": [],
            "error": "XAI_API_KEY not set",
            "undo_info": None,
        }

    full_text = ""
    result = {
        "message": "", "actions_taken": [], "tabs_to_refresh": [],
        "error": None, "undo_info": None,
    }

    for event in run_orryon_stream(user_message, user_id, chat_history, user_name):
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
                "actions_taken": [],
                "tabs_to_refresh": [],
                "error": event["message"],
                "undo_info": None,
            }

    if not result["message"] and full_text:
        result["message"] = full_text

    return result


def run_orryon_stream(
    user_message: str,
    user_id: str,
    chat_history: list[dict] | None = None,
    user_name: str = "there",
) -> Generator[dict, None, None]:
    """
    Streaming generator that yields events as orryon processes a message.

    Event types:
        {"type": "token",  "content": "partial text..."}
        {"type": "tool",   "name": "add_expense", "label": "Logging expense"}
        {"type": "done",   "message": "...", "actions": [...], "tabs": [...], "undo_info": ...}
        {"type": "error",  "message": "..."}
    """
    if not XAI_API_KEY:
        yield {"type": "error", "message": "⚠️ Grok API key not set."}
        return

    system_prompt = get_system_prompt(user_name=user_name)
    memories = _get_user_memories(user_id)
    messages = _build_messages(system_prompt, chat_history or [], user_message, user_id, memories)

    actions_taken: list[dict] = []
    all_tabs: set[str] = set()
    last_undo_info: dict | None = None

    try:
        for _round in range(MAX_TOOL_ROUNDS):
            content_parts: list[str] = []
            tool_calls_buf: list[dict] = []

            for chunk in _call_grok_stream(messages):
                choices = chunk.get("choices")
                if not choices:
                    continue
                delta = choices[0].get("delta", {})

                # Stream text tokens to the UI
                if delta.get("content"):
                    content_parts.append(delta["content"])
                    yield {"type": "token", "content": delta["content"]}

                # Buffer tool-call deltas
                if "tool_calls" in delta:
                    for tc_delta in delta["tool_calls"]:
                        idx = tc_delta.get("index", 0)
                        while len(tool_calls_buf) <= idx:
                            tool_calls_buf.append({
                                "id": "",
                                "type": "function",
                                "function": {"name": "", "arguments": ""},
                            })
                        if tc_delta.get("id"):
                            tool_calls_buf[idx]["id"] = tc_delta["id"]
                        fn = tc_delta.get("function", {})
                        if fn.get("name"):
                            tool_calls_buf[idx]["function"]["name"] += fn["name"]
                        if fn.get("arguments"):
                            tool_calls_buf[idx]["function"]["arguments"] += fn["arguments"]

            # Assemble the full assistant message for history
            full_content = "".join(content_parts)
            assistant_msg: dict[str, Any] = {"role": "assistant", "content": full_content or None}
            if tool_calls_buf:
                assistant_msg["tool_calls"] = tool_calls_buf
            messages.append(assistant_msg)

            # No tool calls → final text response
            if not tool_calls_buf:
                _try_extract_memories(user_message, full_content, user_id)
                yield {
                    "type": "done",
                    "message": full_content,
                    "actions": actions_taken,
                    "tabs": list(all_tabs),
                    "undo_info": last_undo_info,
                }
                return

            # Execute each tool call
            for tc in tool_calls_buf:
                fn_name = tc["function"]["name"]
                label = _TOOL_LABELS.get(fn_name, fn_name.replace("_", " ").title())
                yield {"type": "tool", "name": fn_name, "label": label}

                try:
                    tool_args = json.loads(tc["function"]["arguments"])
                except json.JSONDecodeError:
                    tool_args = {}

                result, tabs = execute_tool(fn_name, tool_args, user_id)
                all_tabs.update(tabs)
                actions_taken.append({"tool": fn_name, "args": tool_args, "result": result})

                # Track undo info for write actions
                if result.get("id") and fn_name in _UNDO_TABLE_MAP:
                    last_undo_info = {
                        "table": _UNDO_TABLE_MAP[fn_name],
                        "id": result["id"],
                        "tool": fn_name,
                        "label": label,
                    }

                messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": json.dumps(result),
                })

        # Exhausted all rounds without a final text response
        yield {
            "type": "done",
            "message": "Done! Let me know if you need anything else.",
            "actions": actions_taken,
            "tabs": list(all_tabs),
            "undo_info": last_undo_info,
        }

    except requests.exceptions.Timeout:
        logger.error("Grok API timeout")
        yield {"type": "error", "message": "orryon is taking too long. Check your internet and try again."}
    except requests.exceptions.HTTPError as exc:
        status = exc.response.status_code if exc.response else 0
        if status == 401:
            msg = "Invalid API key. Check `XAI_API_KEY` in your `.env` file."
        elif status == 429:
            msg = "Rate limit hit. Wait a moment and try again."
        else:
            msg = f"Grok API error {status}. Try again shortly."
        logger.error("Grok HTTP error %s: %s", status, exc)
        yield {"type": "error", "message": msg}
    except Exception as exc:
        logger.error("run_orryon_stream error: %s", exc)
        yield {"type": "error", "message": f"Something went wrong: {exc}"}


# ─────────────────────────────────────────────────────────────────────────────
# API CALLS
# ─────────────────────────────────────────────────────────────────────────────

def _call_grok_stream(messages: list[dict]) -> Generator[dict, None, None]:
    """SSE streaming call to xAI Grok API. Yields parsed JSON chunks."""
    headers = {
        "Authorization": f"Bearer {XAI_API_KEY}",
        "Content-Type": "application/json",
    }
    payload: dict[str, Any] = {
        "model": GROK_MODEL,
        "messages": messages,
        "temperature": 0.15,
        "max_tokens": 2048,
        "tools": TOOL_SCHEMAS,
        "tool_choice": "auto",
        "stream": True,
    }
    resp = requests.post(XAI_API_URL, headers=headers, json=payload, timeout=60, stream=True)
    resp.raise_for_status()

    for line in resp.iter_lines():
        if not line:
            continue
        text = line.decode("utf-8")
        if not text.startswith("data: "):
            continue
        data = text[6:]
        if data.strip() == "[DONE]":
            break
        try:
            yield json.loads(data)
        except json.JSONDecodeError:
            continue


def _call_grok(messages: list[dict]) -> dict:
    """Single non-streaming call to Grok (used for memory extraction)."""
    headers = {
        "Authorization": f"Bearer {XAI_API_KEY}",
        "Content-Type": "application/json",
    }
    payload: dict[str, Any] = {
        "model": GROK_MODEL,
        "messages": messages,
        "temperature": 0,
        "max_tokens": 256,
    }
    resp = requests.post(XAI_API_URL, headers=headers, json=payload, timeout=15)
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
) -> list[dict]:
    """
    Build the messages array for the API call.

    Key improvements over v1:
      - Full history window (50 msgs) including user + assistant messages
      - Memory injection for long-term personalization
      - Richer context snapshot
    """
    context_snip = _get_context_snapshot(user_id)
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

    # Keep last HISTORY_WINDOW messages — include user + assistant (tool msgs
    # from *this* session are built live, but prior-session tool msgs aren't in
    # chat_history so this is safe)
    recent = [m for m in chat_history if m.get("role") in ("user", "assistant")][-HISTORY_WINDOW:]
    for m in recent:
        messages.append({"role": m["role"], "content": m.get("content") or ""})

    messages.append({"role": "user", "content": user_message})
    return messages


# ─────────────────────────────────────────────────────────────────────────────
# CONTEXT HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _get_context_snapshot(user_id: str) -> str:
    """Full context snapshot injected into the system prompt so the AI sees everything."""
    try:
        from core.tools import (
            _get_net_worth, _get_spending_summary, _get_budget_status,
            _get_goals, _get_upcoming_schedule, _get_balance,
        )
        from db import get_total_monthly_income, get_balance as db_get_balance

        bal_data = _get_balance({}, user_id)
        spend = _get_spending_summary({"period": "this_month"}, user_id)
        budget = _get_budget_status({}, user_id)
        goals = _get_goals({}, user_id)
        schedule = _get_upcoming_schedule({"days": 7}, user_id)
        monthly_income = get_total_monthly_income(user_id)

        lines = [
            f"- Balance: ${bal_data['balance']:,.0f}",
            f"- Goals earmarked: ${bal_data['goals_earmarked']:,.0f}",
            f"- Free to spend (balance after goals): ${bal_data['free_to_spend']:,.0f}",
            f"- Monthly income: ${monthly_income:,.0f}" if monthly_income > 0 else "- Monthly income: not set",
            f"- Monthly bills: ${bal_data['monthly_bills']:,.0f}",
            f"- This month's spending: ${spend['total']:,.0f} ({spend['transaction_count']} transactions)",
        ]
        for cat in spend.get("by_category", [])[:5]:
            lines.append(f"  · {cat['category']}: ${cat['total']:,.0f}")
        for b in budget.get("categories", [])[:5]:
            lines.append(
                f"  · Budget {b['category']}: ${b['spent']:,.0f}/${b['planned']:,.0f} ({b['pct_used']}%)"
            )
        if goals.get("goals"):
            lines.append("- Goals:")
            for g in goals["goals"][:5]:
                lines.append(
                    f"  · {g['name']}: ${g['current_amount']:,.0f}/${g['target_amount']:,.0f} ({g['pct_complete']}%)"
                )
        if schedule.get("items"):
            lines.append("- Upcoming (7 days):")
            for item in schedule["items"][:5]:
                amt = f" ${item['amount']:,.0f}" if item.get("amount") else ""
                lines.append(f"  · [{item['type']}] {item['title']} — {item.get('date', '')}{amt}")

        try:
            from db import get_connection
            conn = get_connection()
            recent_notes = conn.execute(
                "SELECT id, title, tags, mood, is_pinned, linked_goal FROM notes "
                "WHERE user_id=? ORDER BY is_pinned DESC, updated_at DESC LIMIT 10",
                (user_id,),
            ).fetchall()
            conn.close()
            if recent_notes:
                lines.append("- Recent notes:")
                for n in recent_notes:
                    n = dict(n)
                    pin = " 📌" if n.get("is_pinned") else ""
                    mood = f" ({n['mood']})" if n.get("mood") else ""
                    goal = f" → {n['linked_goal']}" if n.get("linked_goal") else ""
                    lines.append(f"  · [{n['id'][:8]}] {n['title']}{pin}{mood}{goal}")
        except Exception:
            pass

        return "\n".join(lines)
    except Exception as exc:
        logger.warning("Context snapshot failed: %s", exc)
        return "(context unavailable)"


# ─────────────────────────────────────────────────────────────────────────────
# PERSISTENT MEMORY (Grok-powered fact extraction)
# ─────────────────────────────────────────────────────────────────────────────

def _get_user_memories(user_id: str) -> list[str]:
    """Load stored facts about the user from the database."""
    try:
        from db import get_user_memories
        rows = get_user_memories(user_id, limit=30)
        return [r["fact"] for r in rows]
    except Exception:
        return []


def _try_extract_memories(user_message: str, assistant_response: str, user_id: str) -> None:
    """Non-blocking background extraction of memorable facts via Grok."""
    if not XAI_API_KEY or len(user_message) < 15:
        return
    try:
        t = threading.Thread(
            target=_extract_memories_worker,
            args=(user_message, assistant_response, user_id),
            daemon=True,
        )
        t.start()
    except Exception:
        pass


def _extract_memories_worker(user_message: str, assistant_response: str, user_id: str) -> None:
    """Background thread: ask Grok to extract notable personal facts."""
    try:
        existing = _get_user_memories(user_id)
        if len(existing) > 100:
            return

        result = _call_grok([
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

        content = result["choices"][0]["message"]["content"].strip()
        facts = _parse_json_array(content)

        from db import save_user_memory
        for fact in facts[:3]:
            if isinstance(fact, str) and len(fact.strip()) > 5:
                save_user_memory(user_id, fact.strip())

    except Exception as exc:
        logger.debug("Memory extraction failed (non-critical): %s", exc)


def _parse_json_array(text: str) -> list:
    """Best-effort parse of a JSON array from potentially messy LLM output."""
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
