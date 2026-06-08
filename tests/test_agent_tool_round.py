"""Tests for shared client tool execution in agent loops."""
from unittest.mock import patch

from core.agent_tool_round import AgentTurnState, process_client_tool


def test_process_client_tool_records_action_and_undo():
    state = AgentTurnState()
    with patch("core.agent_tool_round.execute_tool") as mock_exec:
        mock_exec.return_value = (
            {"status": "ok", "id": "tx-1", "merchant": "Coffee"},
            ["budget"],
        )
        result, events = process_client_tool(
            "log_expense",
            {"amount": 5, "merchant": "Coffee"},
            "user-1",
            state,
        )

    assert result["id"] == "tx-1"
    assert events[0]["type"] == "tool"
    assert events[0]["name"] == "log_expense"
    assert state.all_tabs == {"budget"}
    assert len(state.actions_taken) == 1
    assert state.last_undo_info == {
        "table": "transactions",
        "id": "tx-1",
        "tool": "log_expense",
        "label": events[0]["label"],
    }


def test_process_client_tool_emits_confirm_required():
    state = AgentTurnState()
    with patch("core.agent_tool_round.execute_tool") as mock_exec:
        mock_exec.return_value = (
            {"needs_confirmation": True, "message": "Delete this expense?"},
            [],
        )
        _, events = process_client_tool(
            "delete_expense",
            {"expense_id": "x"},
            "user-1",
            state,
        )

    assert any(e["type"] == "confirm_required" for e in events)
