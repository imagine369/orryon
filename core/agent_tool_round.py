"""
Shared client-side tool execution for agent loops (Chat Completions + Responses API).
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from core.agent_context import compute_context_snapshot
from core.agent_memory import schedule_memory_extraction
from core.session_summary import schedule_session_summary
from core.agent_shared import UNDO_TABLE_MAP
from core.canonical_tools import resolve_tool_name
from core.context_cache import invalidate_context_cache, schedule_context_refresh
from core.tool_labels import get_tool_label
from core.tools import execute_tool


@dataclass
class AgentTurnState:
    actions_taken: list[dict] = field(default_factory=list)
    all_tabs: set[str] = field(default_factory=set)
    last_undo_info: dict | None = None
    accumulated_usage: dict[str, int] = field(
        default_factory=lambda: {"prompt_tokens": 0, "completion_tokens": 0},
    )


def merge_usage(state: AgentTurnState, usage: dict[str, int]) -> None:
    state.accumulated_usage["prompt_tokens"] += usage.get("prompt_tokens", 0)
    state.accumulated_usage["completion_tokens"] += usage.get("completion_tokens", 0)


def done_event(
    state: AgentTurnState,
    message: str,
    *,
    citations: list[Any] | None = None,
) -> dict:
    event: dict[str, Any] = {
        "type": "done",
        "message": message,
        "actions": state.actions_taken,
        "tabs": list(state.all_tabs),
        "undo_info": state.last_undo_info,
        "usage": state.accumulated_usage,
    }
    if citations is not None:
        event["citations"] = citations
    return event


def finalize_turn(
    user_message: str,
    full_content: str,
    user_id: str,
    state: AgentTurnState,
    *,
    citations: list[Any] | None = None,
    session_id: str = "",
    chat_history: list[dict] | None = None,
) -> dict:
    schedule_memory_extraction(user_message, full_content, user_id)
    schedule_context_refresh(user_id, lambda: compute_context_snapshot(user_id))
    if session_id:
        extended = list(chat_history or [])
        extended.append({"role": "user", "content": user_message})
        extended.append({"role": "assistant", "content": full_content})
        schedule_session_summary(user_id, session_id, extended)
    return done_event(state, full_content, citations=citations)


def finalize_max_rounds(user_id: str, state: AgentTurnState) -> dict:
    schedule_context_refresh(user_id, lambda: compute_context_snapshot(user_id))
    return done_event(state, "Done! Let me know if you need anything else.")


def process_client_tool(
    fn_name: str,
    tool_args: dict,
    user_id: str,
    state: AgentTurnState,
) -> tuple[dict, list[dict]]:
    """
    Execute one Orryon function tool and update turn state.
    Returns (tool_result, events_to_yield).
    """
    label = get_tool_label(fn_name)
    events: list[dict] = [{"type": "tool", "name": fn_name, "label": label}]

    result, tabs = execute_tool(fn_name, tool_args, user_id)
    state.all_tabs.update(tabs)
    if tabs:
        invalidate_context_cache(user_id)
    state.actions_taken.append({"tool": fn_name, "args": tool_args, "result": result})

    if result.get("needs_confirmation"):
        events.append({
            "type": "confirm_required",
            "action": fn_name,
            "message": result.get("message", "Confirmation required."),
            "args": tool_args,
        })

    canonical = resolve_tool_name(fn_name)
    if result.get("id") and canonical in UNDO_TABLE_MAP:
        state.last_undo_info = {
            "table": UNDO_TABLE_MAP[canonical],
            "id": result["id"],
            "tool": fn_name,
            "label": label,
        }

    return result, events


def parse_tool_args(raw: str) -> dict:
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}
