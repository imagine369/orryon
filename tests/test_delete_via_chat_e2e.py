"""
E2E-style delete-via-chat flow — confirm_required then user_confirmed retry.

Simulates the frontend path: first message triggers confirm_required; user
confirms; second message completes the delete.
"""
from __future__ import annotations

import json
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient

from backend.auth import create_token
from backend.main import app
from core.agent_tool_round import AgentTurnState, process_client_tool
from db import get_or_create_user_by_email, insert_row
from core.tools.shared import _uid


_DEV_ORIGIN = "http://localhost:3000"


def _headers(email: str) -> dict[str, str]:
    user = get_or_create_user_by_email(email)
    token = create_token(user["id"], user["email"], device_name="pytest", ip_address="127.0.0.1")
    return {"Authorization": f"Bearer {token}", "Origin": _DEV_ORIGIN}


def test_delete_via_chat_tool_roundtrip_confirm_then_execute():
    user = get_or_create_user_by_email("pytest-del-e2e@orryon.app")
    tid = _uid()
    insert_row(
        "transactions",
        {
            "id": tid,
            "user_id": user["id"],
            "amount": 6.0,
            "merchant": "e2e-del",
            "description": "e2e",
            "category": "Other",
            "date": "2026-06-01",
        },
    )

    state = AgentTurnState()
    result1, events1 = process_client_tool(
        "delete_expense",
        {"expense_id": tid},
        user["id"],
        state,
    )
    assert result1.get("needs_confirmation") is True
    confirm = next(e for e in events1 if e["type"] == "confirm_required")
    assert confirm["action"] == "delete_expense"
    assert confirm["args"]["expense_id"] == tid

    state2 = AgentTurnState()
    result2, events2 = process_client_tool(
        "delete_expense",
        {"expense_id": tid, "user_confirmed": True},
        user["id"],
        state2,
    )
    assert result2.get("needs_confirmation") is not True
    assert result2.get("status") == "ok"
    assert not any(e.get("type") == "confirm_required" for e in events2)


@pytest.mark.asyncio
async def test_delete_via_chat_sse_confirm_required_event():
    """HTTP SSE path emits confirm_required with contract shape."""
    headers = _headers("pytest-del-sse@orryon.app")
    tid = _uid()
    user = get_or_create_user_by_email("pytest-del-sse@orryon.app")

    async def mock_stream(user_message, user_id, chat_history=None, **kwargs):
        _ = user_message, chat_history, kwargs
        yield {"type": "tool", "name": "delete_expense", "label": "Deleting expense"}
        yield {
            "type": "confirm_required",
            "action": "delete_expense",
            "message": "This will permanently delete the expense.",
            "args": {"expense_id": tid},
        }
        yield {
            "type": "done",
            "message": "Waiting for your confirmation.",
            "actions": [],
            "tabs": [],
            "undo_info": None,
            "usage": {},
        }

    with patch("core.grok_agent.run_orryon_stream", side_effect=mock_stream):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post(
                "/api/chat",
                headers=headers,
                json={"message": f"delete expense {tid}", "session_id": ""},
            )

    assert res.status_code == 200
    payloads = [
        json.loads(line[6:])
        for line in res.text.split("\n")
        if line.startswith("data: ") and line != "data: [DONE]"
    ]
    confirm = next(p for p in payloads if p["type"] == "confirm_required")
    assert confirm["action"] == "delete_expense"
    assert confirm["args"]["expense_id"] == tid
