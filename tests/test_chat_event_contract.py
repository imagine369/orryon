"""Contract tests — SSE and WebSocket chat events must match core/chat_events.py."""
from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from starlette.testclient import TestClient

from backend.auth import create_token, create_ws_ticket
from backend.main import app
from core.chat_events import CHAT_EVENT_CONTRACT, example_events, validate_chat_event
from db.auth import get_or_create_user_by_email

_DEV_ORIGIN = "http://localhost:3000"


def _headers(email: str) -> dict[str, str]:
    user = get_or_create_user_by_email(email)
    token = create_token(user["id"], user["email"], device_name="pytest", ip_address="127.0.0.1")
    return {"Authorization": f"Bearer {token}", "Origin": _DEV_ORIGIN}


def test_example_events_match_contract():
    for event in example_events():
        errors = validate_chat_event(event)
        assert not errors, f"{event['type']}: {errors}"


def test_contract_documents_all_event_types():
    assert set(CHAT_EVENT_CONTRACT) == {
        "session", "token", "tool", "retry", "confirm_required", "done", "error",
    }


async def _mock_stream(*_args, **_kwargs):
    for event in example_events():
        if event["type"] == "session":
            continue
        yield event


@pytest.mark.asyncio
async def test_sse_payloads_validate_against_contract():
    headers = _headers("pytest-contract-sse@orryon.app")

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

    for payload in payloads:
        errors = validate_chat_event(payload)
        assert not errors, f"{payload.get('type')}: {errors}"


def test_ws_payloads_validate_against_contract():
    user = get_or_create_user_by_email("pytest-contract-ws@orryon.app")
    ticket = create_ws_ticket(user["id"], user["email"])

    async def fake_stream(*_args, **_kwargs):
        async for ev in _mock_stream():
            yield ev

    events: list[dict] = []
    with patch("core.grok_agent.run_orryon_stream", side_effect=fake_stream):
        with TestClient(app) as client:
            with client.websocket_connect(f"/ws/chat?ticket={ticket}") as ws:
                ws.send_json({"message": "log coffee $5", "session_id": ""})
                while True:
                    data = ws.receive_json()
                    events.append(data)
                    if data.get("type") in ("done", "error"):
                        break

    for payload in events:
        errors = validate_chat_event(payload)
        assert not errors, f"{payload.get('type')}: {errors}"


@pytest.mark.asyncio
async def test_grok_agent_generic_error_hides_exception_details():
    from core.agent_shared import USER_FACING_CHAT_ERROR
    from core.grok_agent import run_orryon_stream

    async def boom(*_args, **_kwargs):
        raise RuntimeError("secret-internal-db-connection-string")
        yield {"type": "token", "content": ""}  # pragma: no cover

    with (
        patch("core.grok_agent.has_api_keys", return_value=True),
        patch("core.xai_responses.run_orryon_stream_agent", side_effect=boom),
        patch("core.grok_agent.build_messages", return_value=[]),
        patch("core.grok_agent.get_user_memories", return_value=[]),
        patch("core.grok_agent.get_context_snapshot_text", new_callable=AsyncMock, return_value=""),
        patch("core.grok_agent.get_system_prompt", return_value="sys"),
        patch("core.grok_agent.filter_schemas_for_grok", return_value=[]),
        patch("core.grok_agent.next_api_key", return_value="test-key"),
    ):
        events = []
        async for event in run_orryon_stream("hi", "user-1"):
            events.append(event)

    err = next(e for e in events if e["type"] == "error")
    assert err["message"] == USER_FACING_CHAT_ERROR
    assert "secret-internal" not in err["message"]
