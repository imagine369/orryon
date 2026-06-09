"""
xAI HTTP client — shared async httpx client, API key rotation, and Grok API calls.
"""
from __future__ import annotations

import itertools
import json
import logging
from typing import Any

import httpx

from config import XAI_API_KEY, XAI_API_KEYS, GROK_MODEL

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
