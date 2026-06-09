"""Agentic Responses API loop (tool rounds, re-prompt, error handling)."""

from __future__ import annotations

import json
import logging
from typing import AsyncGenerator

import httpx

from core.agent_observability import AGENT_PATH_RESPONSES, capture_agent_failure
from core.agent_shared import needs_tool_reprompt
from core.agent_tool_round import (
    AgentTurnState,
    finalize_max_rounds,
    finalize_turn,
    merge_usage,
    parse_tool_args,
    process_client_tool,
)
from core.orryon_brand import normalize_orryon_in_assistant_reply
from core.user_locale import get_user_language
from core.xai_responses.constants import AgentToolsUnavailable, _AGENT_FALLBACK_STATUSES
from core.xai_responses.errors import responses_error_message
from core.xai_responses.parse import (
    extract_function_calls,
    extract_message_text,
    format_citations_block,
    usage_from_response,
)
from core.xai_responses.stream import stream_responses
from core.xai_responses.tools import split_instructions_and_input

logger = logging.getLogger(__name__)


async def run_orryon_stream_agent(
    *,
    user_message: str,
    user_id: str,
    messages: list[dict],
    responses_tools: list[dict],
    session_id: str = "",
    chat_history: list[dict] | None = None,
    api_key: str,
    reprompt_note: str,
    max_rounds: int = 8,
    agent_path: str = AGENT_PATH_RESPONSES,
) -> AsyncGenerator[dict, None]:
    """
    Agentic Responses API loop (web_search + x_search + Orryon function tools).
    Yields the same event types as run_orryon_stream in grok_agent.py.
    """
    instructions, base_input = split_instructions_and_input(messages)
    state = AgentTurnState()
    reprompted_once = False
    last_tool_name: str | None = None
    current_round = 0

    previous_response_id: str | None = None
    follow_up_input: list[dict] | None = None

    try:
        for _round in range(max_rounds):
            current_round = _round + 1
            content_parts: list[str] = []
            completed: dict | None = None

            async for chunk in stream_responses(
                api_key=api_key,
                instructions=instructions,
                input_items=follow_up_input if follow_up_input is not None else base_input,
                tools=responses_tools,
                previous_response_id=previous_response_id,
                session_id=session_id,
            ):
                if chunk["kind"] == "token":
                    content_parts.append(chunk["content"])
                    yield {"type": "token", "content": chunk["content"]}
                elif chunk["kind"] == "tool":
                    yield {
                        "type": "tool",
                        "name": chunk["name"],
                        "label": chunk["label"],
                    }
                elif chunk["kind"] == "completed":
                    completed = chunk["response"]

            if not completed:
                capture_agent_failure(
                    None,
                    agent_path=agent_path,
                    tool_name=last_tool_name,
                    reprompt=reprompted_once,
                    round_count=current_round,
                    message="incomplete_responses_turn",
                )
                yield {"type": "error", "message": "Orryon did not receive a complete response. Try again."}
                return

            previous_response_id = completed.get("id") or previous_response_id
            merge_usage(state, usage_from_response(completed))

            output = completed.get("output") or []
            function_calls = extract_function_calls(output)
            streamed_text = "".join(content_parts)
            final_text = streamed_text or extract_message_text(output)
            citations = completed.get("citations") or []
            if citations:
                final_text = (final_text or "").rstrip() + format_citations_block(citations)

            full_content = normalize_orryon_in_assistant_reply(
                final_text or "", user_message,
            )

            if not function_calls:
                if (not reprompted_once) and needs_tool_reprompt(
                    user_message,
                    [],
                    full_content,
                    language=get_user_language(user_id),
                ):
                    reprompted_once = True
                    yield {"type": "retry", "reason": "no_tool_called"}
                    follow_up_input = [{
                        "role": "user",
                        "content": reprompt_note,
                    }]
                    continue

                yield finalize_turn(
                    user_message,
                    full_content,
                    user_id,
                    state,
                    citations=citations,
                    session_id=session_id,
                    chat_history=chat_history,
                )
                return

            follow_up_input = []
            for fc in function_calls:
                fn_name = fc["name"]
                last_tool_name = fn_name
                tool_args = parse_tool_args(fc["arguments"])
                result, events = process_client_tool(fn_name, tool_args, user_id, state)
                for ev in events:
                    yield ev
                follow_up_input.append({
                    "type": "function_call_output",
                    "call_id": fc["call_id"],
                    "output": json.dumps(result),
                })

        capture_agent_failure(
            None,
            agent_path=agent_path,
            tool_name=last_tool_name,
            reprompt=reprompted_once,
            round_count=current_round,
            message="max_tool_rounds_exhausted",
        )
        yield finalize_max_rounds(user_id, state)

    except httpx.TimeoutException as exc:
        capture_agent_failure(
            exc,
            agent_path=agent_path,
            tool_name=last_tool_name,
            reprompt=reprompted_once,
            round_count=current_round,
            message="responses_timeout",
        )
        yield {"type": "error", "message": "Orryon is taking too long — please try again."}
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        body = exc.response.text
        if status in _AGENT_FALLBACK_STATUSES:
            logger.warning(
                "xAI Agent Tools unavailable (HTTP %s), will fall back: %s",
                status, body[:300],
            )
            raise AgentToolsUnavailable() from exc
        msg = responses_error_message(status, body)
        capture_agent_failure(
            exc,
            agent_path=agent_path,
            tool_name=last_tool_name,
            reprompt=reprompted_once,
            round_count=current_round,
            message=f"responses_http_{status}",
        )
        yield {"type": "error", "message": msg or "Orryon's AI hit a snag. Try again shortly."}
