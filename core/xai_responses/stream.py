"""Stream a single xAI Responses API turn."""

from __future__ import annotations

import json
from typing import Any, AsyncGenerator

import httpx

from config import GROK_MODEL
from core.xai_responses.constants import (
    CHAT_MAX_OUTPUT_TOKENS,
    SERVER_TOOL_EVENTS,
    XAI_RESPONSES_URL,
)
from core.xai_responses.parse import server_tool_yield

_responses_http_client: httpx.AsyncClient | None = None


def _get_responses_client() -> httpx.AsyncClient:
    global _responses_http_client
    if _responses_http_client is None or _responses_http_client.is_closed:
        _responses_http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(120.0, connect=5.0),
            limits=httpx.Limits(max_keepalive_connections=10, max_connections=20),
        )
    return _responses_http_client


async def stream_responses(
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
                if item_type in SERVER_TOOL_EVENTS and item_type not in seen_server_tools:
                    seen_server_tools.add(item_type)
                    name, label = SERVER_TOOL_EVENTS[item_type]
                    yield {"kind": "tool", "name": name, "label": label}

            # Chat-completions-style chunks on the Responses stream (xAI SDK parity)
            for tc in event.get("tool_calls") or []:
                fn = tc.get("function") or {}
                fn_name = fn.get("name") or ""
                ui = server_tool_yield(fn_name)
                if ui and fn_name not in seen_server_tools:
                    seen_server_tools.add(fn_name)
                    yield {"kind": "tool", "name": ui["name"], "label": ui["label"]}

            if etype == "response.completed":
                response = event.get("response") or {}
                yield {"kind": "completed", "response": response}
