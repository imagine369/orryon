"""
core/grok_agent.py — xAI Grok agent orchestration (streaming, tool use, memory).

All chat turns use the xAI Responses API (core/xai_responses.py). When Agent Tools
(web_search / x_search) are unavailable, retries in degraded mode with function
tools + RSS search_web only.
"""
from __future__ import annotations

import logging
from typing import AsyncGenerator

import httpx

from core.agent_context import compute_context_snapshot
from core.agent_messages import build_messages, get_user_memories
from core.agent_shared import MAX_TOOL_ROUNDS, REPROMPT_SYSTEM_NOTE, USER_FACING_CHAT_ERROR
from core.canonical_tools import filter_schemas_for_grok
from core.context_cache import get_context_snapshot_text
from core.orryon_brand import user_likely_addressing_orryon
from core.system_prompt import get_system_prompt
from core.tools import TOOL_SCHEMAS
from core.user_locale import get_user_locale
from core.xai_client import close_http_client, get_http_client, has_api_keys, next_api_key

logger = logging.getLogger(__name__)

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
        {"type": "confirm_required", "action": "...", "message": "...", "args": {...}}
        {"type": "done",   "message": "...", "actions": [...], "tabs": [...]}
        {"type": "error",  "message": "..."}
    """
    if not has_api_keys():
        yield {"type": "error", "message": "Orryon's AI is not configured. Please try again later."}
        return

    from core.xai_responses import (
        AgentToolsUnavailable,
        chat_schemas_to_responses_tools,
        run_orryon_stream_agent,
    )

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
    cached_session_summary = ""
    if session_id:
        from db import get_session_summary_meta
        cached_session_summary = get_session_summary_meta(session_id).get("summary") or ""
    messages = build_messages(
        system_prompt,
        chat_history or [],
        user_message,
        user_id,
        memories,
        context_snip,
        life_priorities=life_priorities or [],
        cached_session_summary=cached_session_summary,
    )

    agent_kwargs = dict(
        user_message=user_message,
        user_id=user_id,
        messages=messages,
        session_id=session_id,
        chat_history=chat_history or [],
        api_key=next_api_key(),
        reprompt_note=REPROMPT_SYSTEM_NOTE,
        max_rounds=MAX_TOOL_ROUNDS,
    )

    try:
        try:
            async for event in run_orryon_stream_agent(
                **agent_kwargs,
                responses_tools=chat_schemas_to_responses_tools(grok_tools),
            ):
                yield event
        except AgentToolsUnavailable:
            logger.warning(
                "Agent Tools unavailable for user_id=%s — degraded Responses mode (RSS search_web)",
                user_id,
            )
            async for event in run_orryon_stream_agent(
                **agent_kwargs,
                responses_tools=chat_schemas_to_responses_tools(
                    grok_tools, include_agent_tools=False,
                ),
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
        logger.exception("run_orryon_stream error")
        yield {"type": "error", "message": USER_FACING_CHAT_ERROR}
