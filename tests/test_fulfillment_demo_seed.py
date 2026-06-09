"""Tests for marketing demo handoff seeding."""
from __future__ import annotations

from core.integrations.fulfillment.demo_seed import (
    MARKETING_HANDOFF_SPECS,
    clear_marketing_demo_handoffs,
    seed_marketing_handoffs,
)
from core.integrations.fulfillment.handoff import create_handoffs, dismiss_handoff, get_pending_handoffs
from core.tools.handlers.fulfillment import _create_fulfillment_handoff
from db.auth import get_or_create_user_by_email


def test_marketing_specs_count():
    assert len(MARKETING_HANDOFF_SPECS) >= 4


def test_seed_marketing_handoffs_idempotent():
    user = get_or_create_user_by_email("pytest-fulfillment-demo@orryon.app")
    uid = user["id"]
    clear_marketing_demo_handoffs(uid)
    first = seed_marketing_handoffs(uid, force=True)
    assert len(first) == len(MARKETING_HANDOFF_SPECS)
    second = seed_marketing_handoffs(uid, force=False)
    assert len(second) == len(MARKETING_HANDOFF_SPECS)
    pending = get_pending_handoffs(uid)
    demo_rows = [h for h in pending if (h.get("metadata") or {}).get("marketing_demo")]
    assert len(demo_rows) == len(MARKETING_HANDOFF_SPECS)
    clear_marketing_demo_handoffs(uid)


def test_dismiss_handoff_not_found():
    user = get_or_create_user_by_email("pytest-fulfillment-dismiss@orryon.app")
    assert dismiss_handoff(user["id"], "00000000-0000-0000-0000-000000000000") is False


def test_dismiss_handoff_pending_only():
    user = get_or_create_user_by_email("pytest-fulfillment-dismiss@orryon.app")
    uid = user["id"]
    clear_marketing_demo_handoffs(uid)
    created = seed_marketing_handoffs(uid, force=True)
    handoff_id = created[0]["id"]
    assert dismiss_handoff(uid, handoff_id) is True
    assert dismiss_handoff(uid, handoff_id) is False
    assert all(h["id"] != handoff_id for h in get_pending_handoffs(uid))
    clear_marketing_demo_handoffs(uid)


def test_create_handoffs_no_phantom_on_insert_failure(monkeypatch):
    user = get_or_create_user_by_email("pytest-fulfillment-insert-fail@orryon.app")

    def fail_insert(_table: str, _data: dict) -> bool:
        return False

    monkeypatch.setattr("core.integrations.fulfillment.handoff.insert_row", fail_insert)
    batch = create_handoffs(
        user["id"],
        [{"type": "grocery", "title": "Grocery run"}],
    )
    assert batch["handoffs"] == []
    assert len(batch["skipped"]) == 1
    assert "Failed to persist handoff" in batch["skipped"][0]["reason"]


def test_create_handoffs_reports_partial_failures():
    user = get_or_create_user_by_email("pytest-fulfillment-partial@orryon.app")
    batch = create_handoffs(
        user["id"],
        [
            {"type": "grocery", "title": "Valid handoff"},
            {"type": "invalid_type", "title": "Bad type"},
            {"type": "grocery", "title": ""},
        ],
    )
    assert len(batch["handoffs"]) == 1
    assert batch["handoffs"][0]["title"] == "Valid handoff"
    assert len(batch["skipped"]) == 2
    assert batch["skipped"][0]["reason"].startswith("Invalid handoff type")
    assert batch["skipped"][1]["reason"] == "title is required"


def test_fulfillment_tool_partial_response():
    user = get_or_create_user_by_email("pytest-fulfillment-tool-partial@orryon.app")
    result = _create_fulfillment_handoff(
        {
            "handoffs": [
                {"type": "pharmacy", "title": "CVS pickup"},
                {"type": "not_real", "title": "Skip me"},
            ],
        },
        user["id"],
    )
    assert result["status"] == "ok"
    assert result["partial"] is True
    assert result["skipped_count"] == 1
    assert len(result["handoffs"]) == 1
    assert result["skipped"][0]["type"] == "not_real"
