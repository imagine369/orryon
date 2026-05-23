"""
core/xai_responses.py — xAI Responses API with Agent Tools (web_search, x_search).

Used when Live Orryon is enabled: server-side browsing/search like the Grok app,
mixed with Orryon's client-side Life OS function tools.
"""

from __future__ import annotations

import json
import logging
from typing import Any, AsyncGenerator

import httpx

from config import GROK_MODEL
from core.orryon_brand import normalize_orryon_in_assistant_reply
from core.tool_labels import get_tool_label
from core.tools import execute_tool

logger = logging.getLogger(__name__)

XAI_RESPONSES_URL = "https://api.x.ai/v1/responses"

# Raised when Responses + Agent Tools cannot run; grok_agent falls back to chat completions.
class AgentToolsUnavailable(Exception):
    """xAI Agent Tools (web_search / x_search) are not available for this request."""


_AGENT_FALLBACK_STATUSES = frozenset({400, 403, 404, 410, 422})
CHAT_MAX_OUTPUT_TOKENS = 2048

_responses_http_client: httpx.AsyncClient | None = None


def _get_responses_client() -> httpx.AsyncClient:
    global _responses_http_client
    if _responses_http_client is None or _responses_http_client.is_closed:
        _responses_http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(120.0, connect=5.0),
            limits=httpx.Limits(max_keepalive_connections=10, max_connections=20),
        )
    return _responses_http_client

# output[].type for server-executed agent tools (show in UI while searching)
_SERVER_TOOL_EVENTS: dict[str, tuple[str, str]] = {
    "web_search_call": ("web_search", "Searching the web"),
    "x_search_call": ("x_search", "Searching X"),
    "code_interpreter_call": ("code_interpreter", "Running analysis"),
}

# chunk.tool_calls[].function.name prefixes from streaming API
_STREAM_SERVER_TOOL_NAMES: dict[str, str] = {
    "web_search": "Searching the web",
    "web_search_with_snippets": "Searching the web",
    "browse_page": "Browsing the web",
    "x_user_search": "Searching X",
    "x_keyword_search": "Searching X",
    "x_semantic_search": "Searching X",
    "x_thread_fetch": "Reading X thread",
}


def chat_schemas_to_responses_tools(schemas: list[dict]) -> list[dict]:
    """Merge xAI built-in agent tools with Orryon function tools (Responses format)."""
    tools: list[dict] = [
        {"type": "web_search"},
        {"type": "x_search"},
    ]
    for schema in schemas:
        fn = schema.get("function") or {}
        name = fn.get("name")
        if not name or name == "search_web":
            # Native web_search replaces RSS headlines tool.
            continue
        tools.append({
            "type": "function",
            "name": name,
            "description": fn.get("description") or "",
            "parameters": fn.get("parameters") or {"type": "object", "properties": {}},
        })
    return tools


def split_instructions_and_input(messages: list[dict]) -> tuple[str, list[dict]]:
    instructions = ""
    input_items: list[dict] = []
    for msg in messages:
        role = msg.get("role")
        content = msg.get("content") or ""
        if role == "system":
            instructions = content
        elif role in ("user", "assistant"):
            input_items.append({"role": role, "content": content})
    return instructions, input_items


def _format_citations_block(citations: list[Any]) -> str:
    urls = [u for u in citations if isinstance(u, str) and u.strip()]
    if not urls:
        return ""
    lines = ["", "", "**Sources**"]
    for i, url in enumerate(urls[:10], 1):
        lines.append(f"{i}. {url}")
    return "\n".join(lines)


def _usage_from_response(resp: dict) -> dict[str, int]:
    usage = resp.get("usage") or {}
    return {
        "prompt_tokens": int(usage.get("input_tokens") or usage.get("prompt_tokens") or 0),
        "completion_tokens": int(usage.get("output_tokens") or usage.get("completion_tokens") or 0),
    }


def _extract_function_calls(output: list[dict]) -> list[dict]:
    calls: list[dict] = []
    for item in output or []:
        if item.get("type") != "function_call":
            continue
        calls.append({
            "call_id": item.get("call_id") or item.get("id") or "",
            "name": item.get("name") or "",
            "arguments": item.get("arguments") or "{}",
        })
    return [c for c in calls if c["call_id"] and c["name"]]


def _extract_message_text(output: list[dict]) -> str:
    parts: list[str] = []
    for item in reversed(output or []):
        if item.get("type") != "message":
            continue
        for block in item.get("content") or []:
            if block.get("type") == "output_text" and block.get("text"):
                parts.append(block["text"])
        if parts:
            break
    return "".join(parts)


def _server_tool_yield(name: str) -> dict[str, str] | None:
    label = _STREAM_SERVER_TOOL_NAMES.get(name)
    if label:
        tool_key = name.split("_")[0] if name.startswith("x_") else "web_search"
        if name.startswith("x_"):
            tool_key = "x_search"
        elif name in ("browse_page", "web_search", "web_search_with_snippets"):
            tool_key = "web_search"
        return {"type": "tool", "name": tool_key, "label": label}
    return None


async def _stream_responses(
    *,
    api_key: str,
    instructions: str,
    input_items: list[dict],
    tools: list[dict],
    previous_response_id: str | None = None,
    session_id: str = "",
) -> AsyncGenerator[dict[str, Any], None]:
    """Stream one Responses API turn; yields text deltas and the completed response."""
    headers: dict[str, str] = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json; charset=utf-8",
    }
    if session_id:
        headers["x-grok-conv-id"] = session_id

    payload: dict[str, Any] = {
        "model": GROK_MODEL,
        "input": input_items,
        "tools": tools,
        "stream": True,
        "store": True,
        "max_output_tokens": CHAT_MAX_OUTPUT_TOKENS,
    }
    if instructions and not previous_response_id:
        payload["instructions"] = instructions
    if previous_response_id:
        payload["previous_response_id"] = previous_response_id

    seen_server_tools: set[str] = set()
    client = _get_responses_client()
    async with client.stream("POST", XAI_RESPONSES_URL, json=payload, headers=headers) as resp:
        resp.raise_for_status()
        async for line in resp.aiter_lines():
            if not line or not line.startswith("data: "):
                continue
            data = line[6:].strip()
            if data == "[DONE]":
                break
            try:
                event = json.loads(data)
            except json.JSONDecodeError:
                continue

            etype = event.get("type") or ""

            if etype == "response.output_text.delta":
                delta = event.get("delta") or ""
                if delta:
                    yield {"kind": "token", "content": delta}

            elif etype == "response.output_item.added":
                item = event.get("item") or {}
                item_type = item.get("type") or ""
                if item_type in _SERVER_TOOL_EVENTS and item_type not in seen_server_tools:
                    seen_server_tools.add(item_type)
                    name, label = _SERVER_TOOL_EVENTS[item_type]
                    yield {"kind": "tool", "name": name, "label": label}

            # Chat-completions-style chunks on the Responses stream (xAI SDK parity)
            for tc in event.get("tool_calls") or []:
                fn = tc.get("function") or {}
                fn_name = fn.get("name") or ""
                ui = _server_tool_yield(fn_name)
                if ui and fn_name not in seen_server_tools:
                    seen_server_tools.add(fn_name)
                    yield {"kind": "tool", "name": ui["name"], "label": ui["label"]}

            if etype == "response.completed":
                response = event.get("response") or {}
                yield {"kind": "completed", "response": response}


def _responses_error_message(status: int, body: str) -> str:
    if status == 401:
        return "Invalid API key. Check `XAI_API_KEY` in your `.env` file."
    if status == 429:
        return "I'm getting a lot of requests right now. Give me a sec and try again."
    if status >= 500:
        return "Orryon's AI is temporarily unavailable. Try again in a few seconds."
    if status in (400, 403, 404, 422):
        logger.warning("xAI Responses API %s: %s", status, body[:500])
        return ""
    return "Orryon's AI hit a snag. Try again shortly."


async def run_orryon_stream_agent(
    *,
    user_message: str,
    user_id: str,
    messages: list[dict],
    responses_tools: list[dict],
    session_id: str = "",
    api_key: str,
    reprompt_note: str,
    max_rounds: int = 8,
) -> AsyncGenerator[dict, None]:
    """
    Agentic Responses API loop (web_search + x_search + Orryon function tools).
    Yields the same event types as run_orryon_stream in grok_agent.py.
    """
    from core.context_cache import invalidate_context_cache, schedule_context_refresh
    from core.grok_agent import (
        _UNDO_TABLE_MAP,
        _compute_context_snapshot,
        _needs_tool_reprompt,
        _schedule_memory_extraction,
    )

    instructions, base_input = split_instructions_and_input(messages)
    actions_taken: list[dict] = []
    all_tabs: set[str] = set()
    last_undo_info: dict | None = None
    accumulated_usage: dict[str, int] = {"prompt_tokens": 0, "completion_tokens": 0}
    reprompted_once = False

    previous_response_id: str | None = None
    follow_up_input: list[dict] | None = None

    try:
        for _round in range(max_rounds):
            content_parts: list[str] = []
            completed: dict | None = None

            async for chunk in _stream_responses(
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
                yield {"type": "error", "message": "Orryon did not receive a complete response. Try again."}
                return

            previous_response_id = completed.get("id") or previous_response_id
            usage = _usage_from_response(completed)
            accumulated_usage["prompt_tokens"] += usage["prompt_tokens"]
            accumulated_usage["completion_tokens"] += usage["completion_tokens"]

            output = completed.get("output") or []
            function_calls = _extract_function_calls(output)
            streamed_text = "".join(content_parts)
            final_text = streamed_text or _extract_message_text(output)
            citations = completed.get("citations") or []
            if citations:
                final_text = (final_text or "").rstrip() + _format_citations_block(citations)

            full_content = normalize_orryon_in_assistant_reply(
                final_text or "", user_message,
            )

            if not function_calls:
                if (not reprompted_once) and _needs_tool_reprompt(
                    user_message, [], full_content,
                ):
                    reprompted_once = True
                    yield {"type": "retry", "reason": "no_tool_called"}
                    follow_up_input = [{
                        "role": "user",
                        "content": reprompt_note,
                    }]
                    continue

                _schedule_memory_extraction(user_message, full_content, user_id)
                schedule_context_refresh(
                    user_id, lambda: _compute_context_snapshot(user_id),
                )
                yield {
                    "type": "done",
                    "message": full_content,
                    "actions": actions_taken,
                    "tabs": list(all_tabs),
                    "undo_info": last_undo_info,
                    "usage": accumulated_usage,
                    "citations": citations,
                }
                return

            follow_up_input = []
            for fc in function_calls:
                fn_name = fc["name"]
                label = get_tool_label(fn_name)
                yield {"type": "tool", "name": fn_name, "label": label}

                try:
                    tool_args = json.loads(fc["arguments"])
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
                        "id": result["id"],
                        "tool": fn_name,
                        "label": label,
                    }

                follow_up_input.append({
                    "type": "function_call_output",
                    "call_id": fc["call_id"],
                    "output": json.dumps(result),
                })

        schedule_context_refresh(user_id, lambda: _compute_context_snapshot(user_id))
        yield {
            "type": "done",
            "message": "Done! Let me know if you need anything else.",
            "actions": actions_taken,
            "tabs": list(all_tabs),
            "undo_info": last_undo_info,
            "usage": accumulated_usage,
        }

    except httpx.TimeoutException:
        logger.error("xAI Responses API timeout")
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
        msg = _responses_error_message(status, body)
        logger.error("xAI Responses HTTP error %s: %s", status, body[:300])
        yield {"type": "error", "message": msg or "Orryon's AI hit a snag. Try again shortly."}
