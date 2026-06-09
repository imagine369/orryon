"""Parse completed Responses API payloads into Orryon agent fields."""

from __future__ import annotations

from typing import Any

from core.xai_responses.constants import STREAM_SERVER_TOOL_NAMES


def format_citations_block(citations: list[Any]) -> str:
    urls = [u for u in citations if isinstance(u, str) and u.strip()]
    if not urls:
        return ""
    lines = ["", "", "**Sources**"]
    for i, url in enumerate(urls[:10], 1):
        lines.append(f"{i}. {url}")
    return "\n".join(lines)


def usage_from_response(resp: dict) -> dict[str, int]:
    usage = resp.get("usage") or {}
    return {
        "prompt_tokens": int(usage.get("input_tokens") or usage.get("prompt_tokens") or 0),
        "completion_tokens": int(usage.get("output_tokens") or usage.get("completion_tokens") or 0),
    }


def extract_function_calls(output: list[dict]) -> list[dict]:
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


def extract_message_text(output: list[dict]) -> str:
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


def server_tool_yield(name: str) -> dict[str, str] | None:
    label = STREAM_SERVER_TOOL_NAMES.get(name)
    if label:
        tool_key = name.split("_")[0] if name.startswith("x_") else "web_search"
        if name.startswith("x_"):
            tool_key = "x_search"
        elif name in ("browse_page", "web_search", "web_search_with_snippets"):
            tool_key = "web_search"
        return {"type": "tool", "name": tool_key, "label": label}
    return None
