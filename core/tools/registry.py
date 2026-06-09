"""Tool registry and execute_tool dispatcher."""
from __future__ import annotations

import logging
from typing import Any, Callable

import core.tools.handlers as h
from core.canonical_tools import CANONICAL_TOOL_NAMES, resolve_tool_name
from core.tool_labels import get_tool_label, is_destructive_tool
from core.tools.handler_contract import ToolHandlerOutcome, bind_handler, parse_handler_outcome
from core.tools.normalize import normalize_args

logger = logging.getLogger(__name__)

BoundHandler = Callable[[dict, str], ToolHandlerOutcome]

TOOL_SPECS: dict[str, dict[str, Any]] = {
    "log_bill": {"impl": h._add_recurring_bill, "tabs": ["schedule", "forecast"]},
    "get_bills": {"impl": h._get_bills, "tabs": []},
    "edit_bill": {"impl": h._edit_bill, "tabs": ["schedule", "forecast"]},
    "delete_bill": {"impl": h._delete_bill, "tabs": ["schedule", "forecast"]},
    "log_expense": {"impl": h._add_expense, "tabs": ["dashboard", "budget"]},
    "get_expenses": {"impl": h._get_expenses, "tabs": []},
    "edit_expense": {"impl": h._edit_expense, "tabs": ["dashboard", "budget"]},
    "delete_expense": {"impl": h._delete_expense, "tabs": ["dashboard", "budget"]},
    "split_expense": {"impl": h._split_expense, "tabs": ["dashboard", "budget"]},
    "add_calendar_event": {"impl": h._add_calendar_event, "tabs": ["dashboard", "schedule"]},
    "get_calendar": {"impl": h._get_upcoming_schedule, "tabs": []},
    "edit_event": {"impl": h._edit_event, "tabs": ["dashboard", "schedule"]},
    "delete_event": {"impl": h._delete_event, "tabs": ["dashboard", "schedule"]},
    "add_note": {"impl": h._add_note, "tabs": ["notes"]},
    "get_notes": {"impl": h._get_notes, "tabs": []},
    "search_notes": {"impl": h._search_notes, "tabs": []},
    "edit_note": {"impl": h._edit_note, "tabs": ["notes"]},
    "pin_note": {"impl": h._pin_note, "tabs": ["notes"]},
    "delete_note": {"impl": h._delete_note, "tabs": ["notes"]},
    "log_journal_entry": {"impl": h._log_journal_entry, "tabs": ["notes", "journal"]},
    "get_journal": {"impl": h._get_journal, "tabs": []},
    "edit_journal_entry": {"impl": h._edit_journal_entry, "tabs": ["notes", "journal"]},
    "delete_journal_entry": {"impl": h._delete_journal_entry, "tabs": ["notes", "journal"]},
    "create_goal": {"impl": h._add_goal, "tabs": ["dashboard", "goals"]},
    "update_goal": {"impl": h._update_goal_progress, "tabs": ["dashboard", "goals"]},
    "get_goals": {"impl": h._get_goals, "tabs": []},
    "delete_goal": {"impl": h._delete_goal, "tabs": ["dashboard", "goals"]},
    "add_task": {"impl": h._add_task, "tabs": ["schedule"]},
    "edit_task": {"impl": h._edit_task, "tabs": ["schedule"]},
    "complete_task": {"impl": h._complete_task, "tabs": ["schedule"]},
    "delete_task": {"impl": h._delete_task, "tabs": ["schedule"]},
    "create_list": {"impl": h._create_list, "tabs": ["lists"]},
    "get_user_lists": {"impl": h._get_user_lists, "tabs": []},
    "add_list_items": {"impl": h._add_list_items, "tabs": ["lists"]},
    "delete_list": {"impl": h._delete_list, "tabs": ["lists"]},
    "add_grocery_items": {"impl": h._add_grocery_items, "tabs": ["lists", "dashboard"]},
    "check_grocery_item": {"impl": h._check_grocery_item, "tabs": ["lists"]},
    "get_grocery_list": {"impl": h._get_grocery_list, "tabs": []},
    "generate_insights": {"impl": h._generate_insights, "tabs": ["insights"]},
    "generate_forecast": {"impl": h._generate_forecast, "tabs": ["forecast"]},
    "generate_yearly_summary": {"impl": h._generate_yearly_summary, "tabs": ["yearly"]},
    "set_balance": {"impl": h._set_balance, "tabs": ["dashboard", "forecast"]},
    "add_money": {"impl": h._add_money, "tabs": ["dashboard", "budget", "forecast"]},
    "get_balance": {"impl": h._get_balance, "tabs": []},
    "set_budget": {"impl": h._set_budget, "tabs": ["dashboard", "budget"]},
    "get_budget_status": {"impl": h._get_budget_status, "tabs": []},
    "get_spending_summary": {"impl": h._get_spending_summary, "tabs": []},
    "get_spending_recap": {"impl": h._get_spending_recap, "tabs": []},
    "get_spending_patterns": {"impl": h._get_spending_patterns, "tabs": []},
    "get_money_left_after_goals": {"impl": h._get_money_left_after_goals, "tabs": []},
    "add_custom_category": {"impl": h._add_custom_category, "tabs": ["budget"]},
    "set_notification_preferences": {"impl": h._set_notification_preferences, "tabs": []},
    "add_recurring_income": {"impl": h._add_recurring_income, "tabs": ["dashboard", "budget", "forecast"]},
    "get_net_worth": {"impl": h._get_net_worth, "tabs": []},
    "get_subscription_health": {"impl": h._get_subscription_health, "tabs": []},
    "get_mood_spending_report": {"impl": h._get_mood_spending_report, "tabs": []},
    "search_transactions": {"impl": h._search_transactions, "tabs": []},
    "get_wellness_history": {"impl": h._get_wellness_history, "tabs": []},
    "compare_periods": {"impl": h._compare_periods, "tabs": []},
    "cross_feature_search": {"impl": h._cross_feature_search, "tabs": []},
    "log_health_vital": {"impl": h._log_health_vital, "tabs": []},
    "get_health_vitals": {"impl": h._get_health_vitals, "tabs": []},
    "log_medication": {"impl": h._log_medication, "tabs": []},
    "get_medications": {"impl": h._get_medications, "tabs": []},
    "add_health_appointment": {"impl": h._add_health_appointment, "tabs": []},
    "get_health_appointments": {"impl": h._get_health_appointments, "tabs": []},
    "get_weather": {"impl": h._get_weather, "tabs": []},
    "search_web": {"impl": h._search_web, "tabs": []},
}
TOOLS: dict[str, BoundHandler] = {
    name: bind_handler(spec["impl"], spec.get("tabs") or [])
    for name, spec in TOOL_SPECS.items()
}

# Backward-compatible exports (tabs are defined once in TOOL_SPECS, returned via handler contract).
_TOOL_MAP: dict[str, BoundHandler] = dict(TOOLS)
_TAB_REFRESH_MAP: dict[str, list[str]] = {
    name: list(spec.get("tabs") or []) for name, spec in TOOL_SPECS.items()
}


def validate_tool_registry() -> None:
    """Fail fast if canonical tools, handlers, or tab metadata diverge."""
    missing = [n for n in CANONICAL_TOOL_NAMES if n not in TOOL_SPECS]
    if missing:
        raise RuntimeError(f"TOOL_SPECS missing canonical tools: {missing}")
    extra = [n for n in TOOL_SPECS if n not in CANONICAL_TOOL_NAMES]
    if extra:
        raise RuntimeError(f"TOOL_SPECS has non-canonical tools: {extra}")
    for name, spec in TOOL_SPECS.items():
        impl = spec.get("impl")
        if not callable(impl):
            raise RuntimeError(f"TOOL_SPECS[{name!r}] missing callable impl")
        tabs = spec.get("tabs")
        if tabs is None or not isinstance(tabs, list):
            raise RuntimeError(f"TOOL_SPECS[{name!r}] must include tabs: list[str]")


validate_tool_registry()


def _log_destructive_action(
    user_id: str, tool_name: str, args: dict, result: dict,
) -> None:
    """Audit trail for agent-driven deletes (visible under GET /api/approvals/history)."""
    try:
        from db import create_approval_request
        create_approval_request(
            user_id,
            action_type=tool_name,
            description=f"Agent completed {tool_name.replace('_', ' ')}",
            payload={"args": args, "result": result},
            expires_hours=720,
            status="approved",
        )
    except Exception as exc:
        logger.warning("Destructive action audit log failed: %s", exc)


def execute_tool(tool_name: str, args: dict, user_id: str) -> tuple[dict, list[str]]:
    """
    Execute a tool by name with the given args for user_id.
    Arguments are normalised before dispatch (see core.tools.normalize).
    Returns (result_dict, tabs_to_refresh).
    """
    tool_name = resolve_tool_name(tool_name)
    handler = TOOLS.get(tool_name)
    if handler is None:
        return {"error": f"Unknown tool: {tool_name}"}, []
    try:
        args = dict(args or {})
        args = normalize_args(tool_name, args)
        if is_destructive_tool(tool_name) and not args.pop("user_confirmed", False):
            label = get_tool_label(tool_name)
            return {
                "needs_confirmation": True,
                "message": (
                    f"This will permanently {label.lower()}. "
                    "Ask the user to reply yes to confirm (then retry this tool with "
                    "user_confirmed=true) or cancel if they decline."
                ),
                "action": tool_name,
            }, []
        outcome = handler(args, user_id)
        result, tabs = parse_handler_outcome(outcome)
        logger.info("Tool %s executed: %s", tool_name, result)
        if is_destructive_tool(tool_name) and not result.get("error"):
            _log_destructive_action(user_id, tool_name, args, result)
        return result, tabs
    except Exception as exc:
        logger.error("Tool %s error: %s", tool_name, exc)
        return {"error": str(exc)}, []
