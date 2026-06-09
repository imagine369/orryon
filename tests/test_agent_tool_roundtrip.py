"""Integration-style tool round-trip through process_client_tool."""
from __future__ import annotations

from core.agent_tool_round import AgentTurnState, process_client_tool
from db import get_or_create_user_by_email, insert_row
from core.tools.shared import _uid


def test_tool_roundtrip_log_expense():
    user = get_or_create_user_by_email("pytest-roundtrip@orryon.app")
    state = AgentTurnState()

    result, events = process_client_tool(
        "log_expense",
        {"amount": 4.5, "merchant": "Roundtrip Cafe", "category": "Food & Dining", "date": "2026-06-01"},
        user["id"],
        state,
    )

    assert result.get("status") == "ok"
    assert result.get("id")
    assert events[0]["type"] == "tool"
    assert events[0]["name"] == "log_expense"
    assert "budget" in state.all_tabs or "dashboard" in state.all_tabs
    assert state.last_undo_info["table"] == "transactions"


def test_legacy_alias_roundtrip():
    user = get_or_create_user_by_email("pytest-roundtrip-legacy@orryon.app")
    state = AgentTurnState()

    result, events = process_client_tool(
        "add_expense",
        {"amount": 2, "merchant": "Legacy", "category": "Other", "date": "2026-06-02"},
        user["id"],
        state,
    )

    assert result.get("status") == "ok"
    assert events[0]["name"] == "add_expense"


def test_destructive_roundtrip_requires_confirm_then_deletes():
    user = get_or_create_user_by_email("pytest-roundtrip-del@orryon.app")
    tid = _uid()
    insert_row(
        "transactions",
        {
            "id": tid,
            "user_id": user["id"],
            "amount": 8.0,
            "merchant": "pytest-del",
            "description": "del",
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
    assert any(e["type"] == "confirm_required" for e in events1)

    state2 = AgentTurnState()
    result2, _ = process_client_tool(
        "delete_expense",
        {"expense_id": tid, "user_confirmed": True},
        user["id"],
        state2,
    )
    assert result2.get("needs_confirmation") is not True
    assert result2.get("status") == "ok"
