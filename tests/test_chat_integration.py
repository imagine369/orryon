"""Chat API integration — POST /api/chat event sequence with mocked stream."""
from __future__ import annotations

import json
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient

from backend.auth import create_token
from backend.main import app
from db.auth import get_or_create_user_by_email

_DEV_ORIGIN = "http://localhost:3000"


def _headers(email: str) -> dict[str, str]:
    user = get_or_create_user_by_email(email)
    token = create_token(user["id"], user["email"], device_name="pytest", ip_address="127.0.0.1")
    return {"Authorization": f"Bearer {token}", "Origin": _DEV_ORIGIN}


async def _ordered_mock_stream(*_args, **_kwargs):
    yield {"type": "token", "content": "Hi "}
    yield {"type": "tool", "name": "get_balance", "label": "Checking balance"}
    yield {
        "type": "done",
        "message": "Hi there",
        "actions": [],
        "tabs": ["dashboard"],
        "undo_info": None,
        "usage": {"prompt_tokens": 1, "completion_tokens": 2},
    }


@pytest.mark.asyncio
async def test_post_chat_sse_event_sequence():
    headers = _headers("pytest-chat-integration@orryon.app")

    async def fake_stream(*_args, **_kwargs):
        async for ev in _ordered_mock_stream():
            yield ev

    with patch("core.grok_agent.run_orryon_stream", side_effect=fake_stream):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post(
                "/api/chat",
                headers=headers,
                json={"message": "what is my balance?", "session_id": ""},
            )

    assert res.status_code == 200
    chunks = [line for line in res.text.split("\n") if line.startswith("data: ")]
    assert chunks[-1] == "data: [DONE]"

    payloads = [json.loads(line[6:]) for line in chunks if line != "data: [DONE]"]
    types = [p["type"] for p in payloads]

    assert types[0] == "session"
    assert types[1:] == ["token", "tool", "done"]
    assert payloads[0]["session_id"]
    assert payloads[-1]["message"] == "Hi there"
