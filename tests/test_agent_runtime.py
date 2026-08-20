"""Agent runtime — Responses-only path and degraded fallback."""
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from core.xai_responses import AgentToolsUnavailable, chat_schemas_to_responses_tools


@pytest.mark.asyncio
async def test_run_orryon_stream_uses_degraded_tools_on_agent_unavailable():
    from core.grok_agent import run_orryon_stream

    calls: list[list] = []

    async def agent_side_effect(**kwargs):
        calls.append(kwargs.get("responses_tools") or [])
        if len(calls) == 1:
            raise AgentToolsUnavailable()
        yield {"type": "done", "message": "ok", "actions": [], "tabs": []}

    with (
        patch("core.grok_agent.has_chat_api_key", return_value=True),
        patch("core.grok_agent.build_messages", return_value=[]),
        patch("core.grok_agent.get_user_memories", return_value=[]),
        patch("core.grok_agent.get_context_snapshot_text", new_callable=AsyncMock, return_value=""),
        patch("core.grok_agent.get_system_prompt", return_value="sys"),
        patch("core.grok_agent.filter_schemas_for_grok", return_value=[]),
        patch("core.grok_agent.resolve_api_key", return_value="test-key"),
        patch("core.xai_responses.run_orryon_stream_agent", side_effect=agent_side_effect),
    ):
        collected = []
        async for event in run_orryon_stream("hi", "user-1"):
            collected.append(event)

    assert any(e.get("type") == "done" for e in collected)
    assert len(calls) == 2
    degraded_types = {t.get("type") for t in calls[1]}
    assert "web_search" not in degraded_types
    assert "x_search" not in degraded_types


def test_degraded_tool_list_includes_search_web():
    schemas = [
        {"function": {"name": "log_expense", "description": "x", "parameters": {"type": "object", "properties": {}}}},
        {"function": {"name": "search_web", "description": "rss", "parameters": {"type": "object", "properties": {}}}},
    ]
    full = chat_schemas_to_responses_tools(schemas, include_agent_tools=True)
    degraded = chat_schemas_to_responses_tools(schemas, include_agent_tools=False)
    assert any(t.get("type") == "web_search" for t in full)
    assert not any(t.get("type") == "web_search" for t in degraded)
    assert any(t.get("name") == "search_web" for t in degraded if t.get("type") == "function")
