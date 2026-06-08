"""
xAI HTTP client — shared async httpx client, API key rotation, and Grok API calls.
"""
from __future__ import annotations

import itertools
import json
import logging
from typing import Any, AsyncGenerator

import httpx

from config import XAI_API_KEY, XAI_API_KEYS, GROK_MODEL
from core.agent_shared import CHAT_MAX_TOKENS, CHAT_TEMPERATURE
from core.tools import GROK_TOOL_SCHEMAS

logger = logging.getLogger(__name__)

XAI_API_URL = "https://api.x.ai/v1/chat/completions"

_all_keys = [k for k in XAI_API_KEYS if k] if XAI_API_KEYS else ([XAI_API_KEY] if XAI_API_KEY else [])
_key_cycle = itertools.cycle(_all_keys) if _all_keys else None

_http_client: httpx.AsyncClient | None = None


def has_api_keys() -> bool:
    return bool(_all_keys)


def next_api_key() -> str:
    if _key_cycle:
        return next(_key_cycle)
    return XAI_API_KEY


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


async def call_grok_stream(
    messages: list[dict],
    session_id: str = "",
    tools: list[dict] | None = None,
) -> AsyncGenerator[dict, None]:
    """Async SSE streaming call to xAI Chat Completions API."""
    api_key = next_api_key()
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


async def call_grok_async(messages: list[dict]) -> dict:
    """Single non-streaming async call to Grok Chat Completions."""
    api_key = next_api_key()
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
