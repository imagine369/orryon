"""Tool registry, tab refresh map, and execute_tool dispatcher."""
from __future__ import annotations

import logging
from typing import Any, Callable

import core.tools.handlers as h
from core.canonical_tools import CANONICAL_TOOL_NAMES, resolve_tool_name
from core.tool_labels import get_tool_label, is_destructive_tool
from core.tools.normalize import normalize_args

logger = logging.getLogger(__name__)

Handler = Callable[[dict, str], dict]


def _tool(handler: Handler, tabs: list[str] | None = None) -> dict[str, Any]:
    return {"handler": handler, "tabs": tabs or []}


# Single registry: handler + dashboard tabs to refresh after execution.
TOOLS: dict[str, dict[str, Any]] = {
    # Bills
    "log_bill": _tool(h._add_recurring_bill, ["schedule", "forecast"]),
    "get_bills": _tool(h._get_bills),
    "edit_bill": _tool(h._edit_bill, ["schedule", "forecast"]),
    "delete_bill": _tool(h._delete_bill, ["schedule", "forecast"]),
    # Expenses
    "log_expense": _tool(h._add_expense, ["dashboard", "budget"]),
    "get_expenses": _tool(h._get_expenses),
    "edit_expense": _tool(h._edit_expense, ["dashboard", "budget"]),
    "delete_expense": _tool(h._delete_expense, ["dashboard", "budget"]),
    "split_expense": _tool(h._split_expense, ["dashboard", "budget"]),
    # Calendar
    "add_calendar_event": _tool(h._add_calendar_event, ["dashboard", "schedule"]),
    "get_calendar": _tool(h._get_upcoming_schedule),
    "edit_event": _tool(h._edit_event, ["dashboard", "schedule"]),
    "delete_event": _tool(h._delete_event, ["dashboard", "schedule"]),
    # Notes
    "add_note": _tool(h._add_note, ["notes"]),
    "get_notes": _tool(h._get_notes),
    "search_notes": _tool(h._search_notes),
    "edit_note": _tool(h._edit_note, ["notes"]),
    "pin_note": _tool(h._pin_note, ["notes"]),
    "delete_note": _tool(h._delete_note, ["notes"]),
    # Journal
    "log_journal_entry": _tool(h._log_journal_entry, ["notes", "journal"]),
    "get_journal": _tool(h._get_journal),
    "edit_journal_entry": _tool(h._edit_journal_entry, ["notes", "journal"]),
    "delete_journal_entry": _tool(h._delete_journal_entry, ["notes", "journal"]),
    # Goals
    "create_goal": _tool(h._add_goal, ["dashboard", "goals"]),
    "update_goal": _tool(h._update_goal_progress, ["dashboard", "goals"]),
    "get_goals": _tool(h._get_goals),
    "delete_goal": _tool(h._delete_goal, ["dashboard", "goals"]),
    # Tasks
    "add_task": _tool(h._add_task, ["schedule"]),
    "edit_task": _tool(h._edit_task, ["schedule"]),
    "complete_task": _tool(h._complete_task, ["schedule"]),
    "delete_task": _tool(h._delete_task, ["schedule"]),
    # Lists & grocery
    "create_list": _tool(h._create_list, ["lists"]),
    "get_user_lists": _tool(h._get_user_lists),
    "add_list_items": _tool(h._add_list_items, ["lists"]),
    "delete_list": _tool(h._delete_list, ["lists"]),
    "add_grocery_items": _tool(h._add_grocery_items, ["lists", "dashboard"]),
    "check_grocery_item": _tool(h._check_grocery_item, ["lists"]),
    "get_grocery_list": _tool(h._get_grocery_list),
    # Analysis
    "generate_insights": _tool(h._generate_insights, ["insights"]),
    "generate_forecast": _tool(h._generate_forecast, ["forecast"]),
    "generate_yearly_summary": _tool(h._generate_yearly_summary, ["yearly"]),
    # Balance & budget
    "set_balance": _tool(h._set_balance, ["dashboard", "forecast"]),
    "add_money": _tool(h._add_money, ["dashboard", "budget", "forecast"]),
    "get_balance": _tool(h._get_balance),
    "set_budget": _tool(h._set_budget, ["dashboard", "budget"]),
    "get_budget_status": _tool(h._get_budget_status),
    "get_spending_summary": _tool(h._get_spending_summary),
    "get_spending_recap": _tool(h._get_spending_recap),
    "get_spending_patterns": _tool(h._get_spending_patterns),
    "get_money_left_after_goals": _tool(h._get_money_left_after_goals),
    "add_custom_category": _tool(h._add_custom_category, ["budget"]),
    "set_notification_preferences": _tool(h._set_notification_preferences),
    "add_recurring_income": _tool(h._add_recurring_income, ["dashboard", "budget", "forecast"]),
    "get_net_worth": _tool(h._get_net_worth),
    "get_subscription_health": _tool(h._get_subscription_health),
    "get_mood_spending_report": _tool(h._get_mood_spending_report),
    "search_transactions": _tool(h._search_transactions),
    # Cross-feature
    "get_wellness_history": _tool(h._get_wellness_history),
    "compare_periods": _tool(h._compare_periods),
    "cross_feature_search": _tool(h._cross_feature_search),
    # Health
    "log_health_vital": _tool(h._log_health_vital),
    "get_health_vitals": _tool(h._get_health_vitals),
    "log_medication": _tool(h._log_medication),
    "get_medications": _tool(h._get_medications),
    "add_health_appointment": _tool(h._add_health_appointment),
    "get_health_appointments": _tool(h._get_health_appointments),
    # World / live context
    "get_weather": _tool(h._get_weather),
    "search_web": _tool(h._search_web),
}

_missing = [n for n in CANONICAL_TOOL_NAMES if n not in TOOLS]
if _missing:
    raise RuntimeError(f"TOOLS registry missing canonical tools: {_missing}")

# Backward-compatible exports for callers that import the flat maps.
_TOOL_MAP: dict[str, Handler] = {k: v["handler"] for k, v in TOOLS.items()}
_TAB_REFRESH_MAP: dict[str, list[str]] = {k: v["tabs"] for k, v in TOOLS.items()}


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
    Arguments are normalised in-place (dates -> ISO, amounts -> positive float,
    category / mood / frequency snapped to canonical taxonomy) before dispatch.
    Returns (result_dict, tabs_to_refresh).
    """
    tool_name = resolve_tool_name(tool_name)
    entry = TOOLS.get(tool_name)
    if entry is None:
        return {"error": f"Unknown tool: {tool_name}"}, []
    fn = entry["handler"]
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
        result = fn(args, user_id)
        tabs = entry["tabs"]
        logger.info("Tool %s executed: %s", tool_name, result)
        if is_destructive_tool(tool_name) and not result.get("error"):
            _log_destructive_action(user_id, tool_name, args, result)
        return result, tabs
    except Exception as exc:
        logger.error("Tool %s error: %s", tool_name, exc)
        return {"error": str(exc)}, []
