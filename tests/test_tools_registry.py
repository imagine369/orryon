"""Tool registry — destructive confirmation and health handlers."""
from __future__ import annotations

import re

import pytest

from core.canonical_tools import (
    CANONICAL_TOOL_NAMES,
    LEGACY_TOOL_ALIASES,
    _REPROMPT_SECTIONS,
    resolve_tool_name,
)
from core.tools import GROK_TOOL_SCHEMAS, TOOL_SCHEMAS, execute_tool
from core.tools.handler_contract import parse_handler_outcome
from core.tools.registry import TOOL_SPECS, TOOLS, _TOOL_MAP, validate_tool_registry
from tool_minimal_args import minimal_args_for_tool, seed_tool_fixtures
from db.auth import get_or_create_user_by_email
from db.health import (
    get_health_vitals,
    get_medications,
)


@pytest.fixture
def user_id():
    user = get_or_create_user_by_email("pytest-tools@orryon.app")
    return user["id"]


def test_validate_tool_registry_passes():
    validate_tool_registry()


def test_tools_registry_covers_canonical_names():
    missing = [n for n in CANONICAL_TOOL_NAMES if n not in TOOL_SPECS]
    assert not missing, f"missing from TOOL_SPECS: {missing}"
    assert set(TOOLS) == set(TOOL_SPECS)


def test_every_canonical_tool_has_handler_and_tab_metadata():
    for name in CANONICAL_TOOL_NAMES:
        spec = TOOL_SPECS[name]
        assert callable(spec["impl"]), f"{name} missing impl"
        assert isinstance(spec["tabs"], list), f"{name} tabs must be a list"


def test_parse_handler_outcome_contract():
    result, tabs = parse_handler_outcome({"result": {"status": "ok"}, "tabs": ["budget"]})
    assert result == {"status": "ok"}
    assert tabs == ["budget"]


def test_bound_handler_returns_contract_via_execute(user_id):
    result, tabs = execute_tool("get_balance", {}, user_id)
    assert isinstance(result, dict)
    assert isinstance(tabs, list)


def test_legacy_aliases_not_in_tools_map():
    for legacy in LEGACY_TOOL_ALIASES:
        assert legacy not in _TOOL_MAP
        assert resolve_tool_name(legacy) in TOOLS


def test_legacy_alias_dispatches_like_canonical(user_id):
    from db import insert_row
    from core.tools.shared import _uid

    tid = _uid()
    insert_row(
        "transactions",
        {
            "id": tid,
            "user_id": user_id,
            "amount": 12.0,
            "merchant": "legacy-alias",
            "description": "pytest",
            "category": "Other",
            "date": "2026-05-01",
        },
    )
    result, tabs = execute_tool("add_expense", {"amount": 3.5, "merchant": "alias"}, user_id)
    assert "error" not in result or not result["error"]
    assert "dashboard" in tabs or "budget" in tabs


def test_reprompt_sections_list_every_canonical_tool():
    listed = set()
    for section in _REPROMPT_SECTIONS:
        for name in re.findall(r"[a-z][a-z0-9_]*", section):
            if name in CANONICAL_TOOL_NAMES:
                listed.add(name)
    missing = sorted(set(CANONICAL_TOOL_NAMES) - listed)
    assert not missing, f"missing from _REPROMPT_SECTIONS: {missing}"


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


@pytest.fixture
def seeded_tools(user_id):
    return seed_tool_fixtures(user_id)


@pytest.mark.parametrize("tool_name", CANONICAL_TOOL_NAMES)
def test_every_canonical_tool_executes_on_minimal_args(tool_name, user_id, seeded_tools):
    args = minimal_args_for_tool(tool_name, seeded_tools)
    result, tabs = execute_tool(tool_name, args, user_id)
    assert isinstance(result, dict)
    assert isinstance(tabs, list)
    if result.get("needs_confirmation"):
        return
    if tool_name in ("get_weather", "search_web") and result.get("error"):
        return
    assert not result.get("error"), f"{tool_name} failed: {result}"
