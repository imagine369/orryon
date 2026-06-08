"""
core/grok_agent.py — xAI Grok agent orchestration (streaming, tool use, memory).

Web search uses the Responses API (core/xai_responses.py) with Chat Completions
as a silent fallback when Agent Tools are unavailable.
"""
from __future__ import annotations

import json
import logging
from typing import Any, AsyncGenerator

import httpx

from core.agent_context import compute_context_snapshot
from core.agent_messages import build_messages, get_user_memories
from core.agent_shared import (
    MAX_TOOL_ROUNDS,
    REPROMPT_SYSTEM_NOTE,
    needs_tool_reprompt,
)
from core.agent_tool_round import (
    AgentTurnState,
    finalize_max_rounds,
    finalize_turn,
    merge_usage,
    parse_tool_args,
    process_client_tool,
)
from core.canonical_tools import filter_schemas_for_grok
from core.context_cache import get_context_snapshot_text
from core.orryon_brand import (
    normalize_orryon_in_assistant_reply,
    user_likely_addressing_orryon,
)
from core.system_prompt import get_system_prompt
from core.tools import TOOL_SCHEMAS
from core.user_locale import get_user_locale
from core.xai_client import call_grok_stream, close_http_client, get_http_client, has_api_keys

logger = logging.getLogger(__name__)

# Re-export for backend.main and backend/routers/chat.py
__all__ = [
    "run_orryon",
    "run_orryon_stream",
    "get_http_client",
    "close_http_client",
]


async def run_orryon(
    user_message: str,
    user_id: str,
    chat_history: list[dict] | None = None,
    user_name: str = "there",
    session_id: str = "",
) -> dict:
    """Non-streaming entrypoint — collects the full response from the async stream."""
    if not has_api_keys():
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
    life_priorities: list[str] | None = None,
) -> AsyncGenerator[dict, None]:
    """
    Async streaming generator that yields events as orryon processes a message.

    Event types:
        {"type": "token",  "content": "partial text..."}
        {"type": "tool",   "name": "log_expense", "label": "Logging expense"}
        {"type": "retry",  "reason": "no_tool_called"}
        {"type": "done",   "message": "...", "actions": [...], "tabs": [...]}
        {"type": "error",  "message": "..."}
    """
    if not has_api_keys():
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
        locale_block=locale.prompt_block() + brand_hint,
    )
    grok_tools = filter_schemas_for_grok(TOOL_SCHEMAS)
    memories = get_user_memories(user_id)
    context_snip = await get_context_snapshot_text(
        user_id, lambda: compute_context_snapshot(user_id),
    )
    messages = build_messages(
        system_prompt,
        chat_history or [],
        user_message,
        user_id,
        memories,
        context_snip,
        life_priorities=life_priorities or [],
    )

    state = AgentTurnState()
    reprompted_once = False

    try:
        from core.xai_responses import (
            AgentToolsUnavailable,
            chat_schemas_to_responses_tools,
            run_orryon_stream_agent,
        )
        from core.xai_client import next_api_key

        try:
            async for event in run_orryon_stream_agent(
                user_message=user_message,
                user_id=user_id,
                messages=messages,
                responses_tools=chat_schemas_to_responses_tools(grok_tools),
                session_id=session_id,
                api_key=next_api_key(),
                reprompt_note=REPROMPT_SYSTEM_NOTE,
                max_rounds=MAX_TOOL_ROUNDS,
            ):
                yield event
            return
        except AgentToolsUnavailable:
            logger.warning(
                "Agent Tools unavailable for user_id=%s — using chat completions fallback",
                user_id,
            )

        async for event in _run_chat_completions_loop(
            user_message=user_message,
            user_id=user_id,
            messages=messages,
            grok_tools=grok_tools,
            session_id=session_id,
            state=state,
            reprompted_once=reprompted_once,
        ):
            yield event

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


async def _run_chat_completions_loop(
    *,
    user_message: str,
    user_id: str,
    messages: list[dict],
    grok_tools: list[dict],
    session_id: str,
    state: AgentTurnState,
    reprompted_once: bool,
) -> AsyncGenerator[dict, None]:
    for _round in range(MAX_TOOL_ROUNDS):
        content_parts: list[str] = []
        tool_calls_buf: list[dict] = []

        async for chunk in call_grok_stream(
            messages, session_id=session_id, tools=grok_tools,
        ):
            if chunk.get("usage"):
                merge_usage(state, chunk["usage"])

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
            if (not reprompted_once) and needs_tool_reprompt(
                user_message, tool_calls_buf, full_content,
            ):
                reprompted_once = True
                logger.info(
                    "Soft re-prompt triggered for user_id=%s (user msg: %r)",
                    user_id, (user_message or "")[:120],
                )
                yield {"type": "retry", "reason": "no_tool_called"}
                messages.append({
                    "role": "system",
                    "content": REPROMPT_SYSTEM_NOTE,
                })
                continue

            yield finalize_turn(user_message, full_content, user_id, state)
            return

        for tc in tool_calls_buf:
            fn_name = tc["function"]["name"]
            tool_args = parse_tool_args(tc["function"]["arguments"])
            result, events = process_client_tool(fn_name, tool_args, user_id, state)
            for ev in events:
                yield ev
            messages.append({
                "role": "tool", "tool_call_id": tc["id"],
                "content": json.dumps(result),
            })

    yield finalize_max_rounds(user_id, state)
