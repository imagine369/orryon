"""SSE event shape tests for chat streaming."""
from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from backend.auth import create_token
from backend.main import app
from db import get_or_create_user_by_email

_DEV_ORIGIN = "http://localhost:3000"


def _headers(email: str) -> dict[str, str]:
    user = get_or_create_user_by_email(email)
    token = create_token(user["id"], user["email"], device_name="pytest", ip_address="127.0.0.1")
    return {"Authorization": f"Bearer {token}", "Origin": _DEV_ORIGIN}


async def _mock_stream(*_args, **_kwargs):
    yield {"type": "token", "content": "Hi "}
    yield {"type": "tool", "name": "log_expense", "label": "Logging expense"}
    yield {
        "type": "confirm_required",
        "action": "delete_expense",
        "message": "Delete this?",
        "args": {"expense_id": "x"},
    }
    yield {
        "type": "retry",
        "reason": "no_tool_called",
    }
    yield {
        "type": "done",
        "message": "Hi there",
        "actions": [],
        "tabs": ["budget"],
        "undo_info": None,
        "usage": {"prompt_tokens": 1, "completion_tokens": 2},
    }


@pytest.mark.asyncio
async def test_chat_sse_event_shapes():
    headers = _headers("pytest-sse@orryon.app")

    async def fake_stream(*_args, **_kwargs):
        async for ev in _mock_stream():
            yield ev

    with patch("core.grok_agent.run_orryon_stream", side_effect=fake_stream):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post(
                "/api/chat",
                headers=headers,
                json={"message": "log coffee $5", "session_id": ""},
            )

    assert res.status_code == 200
    chunks = [line for line in res.text.split("\n") if line.startswith("data: ")]
    payloads = [json.loads(line[6:]) for line in chunks if line != "data: [DONE]"]

    types = {p["type"] for p in payloads}
    assert types >= {"token", "tool", "confirm_required", "retry", "done"}

    token = next(p for p in payloads if p["type"] == "token")
    assert "content" in token

    tool = next(p for p in payloads if p["type"] == "tool")
    assert tool["name"] == "log_expense"
    assert "label" in tool

    confirm = next(p for p in payloads if p["type"] == "confirm_required")
    assert confirm["action"] == "delete_expense"
    assert "message" in confirm

    done = next(p for p in payloads if p["type"] == "done")
    assert done["message"] == "Hi there"
    assert "tabs" in done
