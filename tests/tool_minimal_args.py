"""Minimal argument fixtures for canonical tool smoke tests."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from core.tools import execute_tool
from core.tools.shared import _today, _uid


@dataclass
class SeededToolIds:
    expense_id: str
    bill_id: str
    event_id: str
    note_id: str
    journal_id: str
    goal_id: str
    task_id: str
    list_id: str
    vital_id: str
    medication_id: str
    appointment_id: str


def seed_tool_fixtures(user_id: str) -> SeededToolIds:
    """Create one row per domain so edit/delete tools have valid targets."""
    expense_id = _run(user_id, "log_expense", {
        "amount": 12.5,
        "merchant": "pytest-seed",
        "category": "Food & Dining",
        "date": _today(),
    })
    bill_id = _run(user_id, "log_bill", {
        "name": "pytest-bill",
        "amount": 9.99,
        "frequency": "monthly",
        "due_date": _today(),
    })
    event_id = _run(user_id, "add_calendar_event", {
        "title": "pytest-event",
        "start": f"{_today()}T10:00:00",
        "end": f"{_today()}T11:00:00",
    })
    note_id = _run(user_id, "add_note", {
        "title": "pytest-note",
        "content": "seed note body",
    })
    journal_id = _run(user_id, "log_journal_entry", {
        "content": "pytest journal seed",
        "mood": "neutral",
    })
    goal_id = _run(user_id, "create_goal", {
        "name": "pytest-goal",
        "target_amount": 500,
        "target_date": _today(),
    })
    task_id = _run(user_id, "add_task", {
        "title": "pytest-task",
        "due_date": _today(),
    })
    list_id = _run(user_id, "create_list", {"name": "pytest-list"})
    _run(user_id, "add_list_items", {"list_id": list_id, "items": ["milk", "eggs"]}, require_id=False)
    _run(user_id, "add_grocery_items", {"items": [{"name": "bread"}]}, require_id=False)
    vital_id = _run(user_id, "log_health_vital", {
        "type": "weight",
        "value": 70,
        "unit": "kg",
    })
    medication_id = _run(user_id, "log_medication", {
        "name": "pytest-vitamin",
        "dose": "1 tab",
        "frequency": "daily",
    })
    appointment_id = _run(user_id, "add_health_appointment", {
        "provider": "pytest-clinic",
        "date": _today(),
        "type": "checkup",
    })
    _run(user_id, "set_balance", {"amount": 1000}, require_id=False)
    _run(user_id, "set_budget", {"category": "Food & Dining", "amount": 200}, require_id=False)

    return SeededToolIds(
        expense_id=expense_id,
        bill_id=bill_id,
        event_id=event_id,
        note_id=note_id,
        journal_id=journal_id,
        goal_id=goal_id,
        task_id=task_id,
        list_id=list_id,
        vital_id=vital_id,
        medication_id=medication_id,
        appointment_id=appointment_id,
    )


def _run(user_id: str, tool: str, args: dict, *, require_id: bool = True) -> str:
    result, _ = execute_tool(tool, args, user_id)
    assert "error" not in result or not result["error"], f"{tool}: {result}"
    rid = (
        result.get("id")
        or result.get("expense_id")
        or result.get("bill_id")
        or result.get("list_id")
    )
    if not rid and result.get("ids"):
        rid = result["ids"][0]
    if require_id:
        assert rid, f"{tool} missing id: {result}"
        return str(rid)
    return str(rid or "")


def minimal_args_for_tool(name: str, seeded: SeededToolIds) -> dict[str, Any]:
    """Return the smallest args dict that exercises each canonical handler."""
    today = _today()
    mapping: dict[str, dict[str, Any]] = {
        "log_bill": {"name": "smoke-bill", "amount": 5, "frequency": "monthly", "due_date": today},
        "get_bills": {},
        "edit_bill": {"bill_id": seeded.bill_id, "amount": 6},
        "delete_bill": {"bill_id": seeded.bill_id},
        "log_expense": {"amount": 4, "merchant": "smoke", "category": "Other", "date": today},
        "get_expenses": {},
        "edit_expense": {"expense_id": seeded.expense_id, "amount": 5},
        "delete_expense": {"expense_id": seeded.expense_id},
        "split_expense": {
            "amount": 20,
            "merchant": "split-dinner",
            "category": "Food & Dining",
            "split_count": 2,
        },
        "add_calendar_event": {
            "title": "smoke-event",
            "start": f"{today}T14:00:00",
            "end": f"{today}T15:00:00",
        },
        "get_calendar": {},
        "edit_event": {"event_id": seeded.event_id, "title": "smoke-event-edited"},
        "delete_event": {"event_id": seeded.event_id},
        "add_note": {"title": "smoke-note", "content": "body"},
        "get_notes": {},
        "search_notes": {"query": "smoke"},
        "edit_note": {"note_id": seeded.note_id, "content": "edited"},
        "pin_note": {"note_id": seeded.note_id, "pinned": True},
        "delete_note": {"note_id": seeded.note_id},
        "log_journal_entry": {"content": "smoke journal", "mood": "neutral"},
        "get_journal": {},
        "edit_journal_entry": {"entry_id": seeded.journal_id, "content": "edited journal"},
        "delete_journal_entry": {"entry_id": seeded.journal_id},
        "create_goal": {"name": "smoke-goal", "target_amount": 100, "target_date": today},
        "get_goals": {},
        "update_goal": {"name": "pytest-goal", "progress_amount": 10},
        "delete_goal": {"goal_id": seeded.goal_id},
        "add_task": {"title": "smoke-task", "due_date": today},
        "edit_task": {"task_id": seeded.task_id, "title": "smoke-task-edited"},
        "complete_task": {"task_title": "pytest-task"},
        "delete_task": {"task_id": seeded.task_id},
        "create_list": {"name": "smoke-list"},
        "get_user_lists": {},
        "add_list_items": {"list_id": seeded.list_id, "items": ["item-a"]},
        "delete_list": {"list_id": seeded.list_id},
        "add_grocery_items": {"items": [{"name": "butter"}]},
        "delete_grocery_items": {"item_names": ["butter"]},
        "check_grocery_item": {"item_name": "bread"},
        "uncheck_grocery_item": {"item_name": "bread"},
        "get_grocery_list": {},
        "generate_insights": {},
        "generate_forecast": {},
        "generate_yearly_summary": {},
        "set_balance": {"amount": 1200},
        "add_money": {"amount": 25, "note": "smoke"},
        "get_balance": {},
        "set_budget": {"category": "Groceries", "amount": 150},
        "get_budget_status": {},
        "get_spending_summary": {},
        "get_spending_recap": {},
        "get_spending_patterns": {},
        "get_money_left_after_goals": {},
        "add_custom_category": {"name": "SmokeCat"},
        "set_notification_preferences": {"daily_digest_enabled": True},
        "get_wellness_history": {},
        "compare_periods": {
            "scope": "spending",
            "period_a_from": "2026-04-01",
            "period_a_to": "2026-04-30",
            "period_b_from": "2026-05-01",
            "period_b_to": "2026-05-31",
        },
        "cross_feature_search": {"query": "smoke"},
        "search_transactions": {"query": "pytest"},
        "get_net_worth": {},
        "get_subscription_health": {},
        "get_mood_spending_report": {},
        "add_recurring_income": {
            "name": "smoke-income",
            "amount": 1000,
            "frequency": "monthly",
        },
        "log_health_vital": {"type": "steps", "value": 5000, "unit": "steps"},
        "get_health_vitals": {},
        "log_medication": {"name": "smoke-med", "dose": "5mg", "frequency": "daily"},
        "get_medications": {},
        "add_health_appointment": {"provider": "smoke-clinic", "date": today, "type": "checkup"},
        "get_health_appointments": {},
        "get_weather": {"location": "London"},
        "search_web": {"query": "technology", "limit": 3},
        "create_fulfillment_handoff": {
            "handoffs": [{"type": "grocery", "title": "Grocery run"}],
        },
    }
    if name not in mapping:
        raise KeyError(f"No minimal args for {name}")
    return dict(mapping[name])
