"""Chat history persists tool actions for session restore."""
from __future__ import annotations

import json
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient

from backend.auth import create_token
from backend.main import app
from db.auth import get_or_create_user_by_email
from db.chat import decode_tool_actions, encode_tool_actions, save_chat_message, load_chat_history

_DEV_ORIGIN = "http://localhost:3000"

_FULFILLMENT_ACTION = {
    "tool": "create_fulfillment_handoff",
    "args": {},
    "result": {
        "status": "ok",
        "handoffs": [
            {
                "id": "hist-handoff-1",
                "type": "grocery",
                "title": "Grocery run",
                "subtitle": "milk, eggs",
                "action_label": "Shop on Instacart",
                "action_url": "https://www.instacart.com/store/s?k=milk",
                "status": "pending",
                "created_at": "2026-06-09T00:00:00Z",
            },
        ],
    },
}


def _headers(email: str) -> dict[str, str]:
    user = get_or_create_user_by_email(email)
    token = create_token(user["id"], user["email"], device_name="pytest", ip_address="127.0.0.1")
    return {"Authorization": f"Bearer {token}", "Origin": _DEV_ORIGIN}


def test_encode_decode_tool_actions_roundtrip():
    actions = [_FULFILLMENT_ACTION]
    encoded = encode_tool_actions(actions)
    assert decode_tool_actions(encoded) == actions


def test_save_chat_message_restores_actions_in_history():
    user = get_or_create_user_by_email("pytest-chat-actions@orryon.app")
    uid = user["id"]
    from db.chat import create_chat_session

    session = create_chat_session(uid, title="pytest")
    sid = session["id"]
    save_chat_message(
        uid,
        {"role": "assistant", "content": "Your errand is ready.", "tool_actions": [_FULFILLMENT_ACTION]},
        session_id=sid,
    )
    history = load_chat_history(uid, session_id=sid)
    assistant = next(m for m in history if m["role"] == "assistant")
    assert assistant["actions"] == [_FULFILLMENT_ACTION]


@pytest.mark.asyncio
async def test_post_chat_history_includes_fulfillment_actions():
    headers = _headers("pytest-chat-actions-sse@orryon.app")

    async def fake_stream(*_args, **_kwargs):
        yield {"type": "token", "content": "Done. "}
        yield {
            "type": "done",
            "message": "Done. Your grocery handoff is ready.",
            "actions": [_FULFILLMENT_ACTION],
            "tabs": ["errands"],
            "usage": {"prompt_tokens": 1, "completion_tokens": 2},
        }

    session_id = ""

    with patch("core.grok_agent.run_orryon_stream", side_effect=fake_stream):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post(
                "/api/chat",
                headers=headers,
                json={"message": "order groceries", "session_id": ""},
            )
            assert res.status_code == 200
            chunks = [line for line in res.text.split("\n") if line.startswith("data: ")]
            session_id = json.loads(chunks[0][6:])["session_id"]

            history = await client.get(
                f"/api/chat/history?session_id={session_id}",
                headers=headers,
            )
        assert history.status_code == 200
        assistant = next(m for m in history.json() if m["role"] == "assistant")
        assert assistant["actions"] == [_FULFILLMENT_ACTION]
