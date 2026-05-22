"""Tool registry — destructive confirmation and health handlers."""
from __future__ import annotations

import pytest

from core.tools import CANONICAL_TOOL_NAMES, GROK_TOOL_SCHEMAS, TOOL_SCHEMAS, execute_tool
from core.tools.registry import _TOOL_MAP
from db import get_health_vitals, get_medications, get_or_create_user_by_email


@pytest.fixture
def user_id():
    user = get_or_create_user_by_email("pytest-tools@orryon.app")
    return user["id"]


def test_canonical_tools_have_schemas():
    names = {s["function"]["name"] for s in TOOL_SCHEMAS}
    missing = [n for n in CANONICAL_TOOL_NAMES if n not in names]
    assert not missing, f"missing schemas: {missing}"
    assert len(GROK_TOOL_SCHEMAS) == len(CANONICAL_TOOL_NAMES)


def test_health_tools_registered():
    for name in (
        "log_health_vital",
        "get_health_vitals",
        "log_medication",
        "get_medications",
        "add_health_appointment",
        "get_health_appointments",
    ):
        assert name in _TOOL_MAP
        assert name in CANONICAL_TOOL_NAMES


def test_delete_requires_user_confirmed(user_id):
    from db import insert_row
    from core.tools.shared import _uid

    tid = _uid()
    insert_row(
        "transactions",
        {
            "id": tid,
            "user_id": user_id,
            "amount": 9.5,
            "merchant": "pytest",
            "description": "smoke",
            "category": "Other",
            "date": "2026-05-01",
        },
    )
    result, tabs = execute_tool("delete_expense", {"expense_id": tid}, user_id)
    assert result.get("needs_confirmation") is True
    assert tabs == []

    result2, _ = execute_tool(
        "delete_expense", {"expense_id": tid, "user_confirmed": True}, user_id
    )
    assert result2.get("needs_confirmation") is not True
    assert "error" not in result2 or not result2["error"]


def test_log_health_vital_and_read(user_id):
    result, _ = execute_tool(
        "log_health_vital",
        {"type": "weight", "value": 150, "unit": "lb"},
        user_id,
    )
    assert result.get("status") == "ok"
    assert result.get("id")

    listed, _ = execute_tool("get_health_vitals", {"type": "weight"}, user_id)
    assert listed.get("count", 0) >= 1
    assert any(v["type"] == "weight" for v in listed.get("vitals", []))


def test_log_medication(user_id):
    result, _ = execute_tool(
        "log_medication",
        {"name": "Vitamin D", "dose": "1000 IU", "frequency": "daily"},
        user_id,
    )
    assert result.get("status") == "ok"
    rows = get_medications(user_id)
    assert any(m["name"] == "Vitamin D" for m in rows)
