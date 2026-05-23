"""Tool registry, tab refresh map, and execute_tool dispatcher."""
from __future__ import annotations

import logging

import core.tools.helpers as h
from core.tool_labels import get_tool_label, is_destructive_tool
from core.tools.normalize import normalize_args

logger = logging.getLogger(__name__)

_TOOL_MAP = {
    # Bills
    "log_bill": h._add_recurring_bill,
    "get_bills": h._get_bills,
    # Expenses
    "log_expense": h._add_expense,
    "get_expenses": h._get_expenses,
    # Calendar
    "add_calendar_event": h._add_calendar_event,
    "get_calendar": h._get_upcoming_schedule,
    # Notes
    "add_note": h._add_note,
    "get_notes": h._get_notes,
    # Journal
    "log_journal_entry": h._log_journal_entry,
    "get_journal": h._get_journal,
    # Goals
    "create_goal": h._add_goal,
    "update_goal": h._update_goal_progress,
    "get_goals": h._get_goals,
    # Analysis
    "generate_insights": h._generate_insights,
    "generate_forecast": h._generate_forecast,
    "generate_yearly_summary": h._generate_yearly_summary,

    # Full-CRUD additions (v3.1)
    "edit_bill": h._edit_bill,
    "delete_goal": h._delete_goal,
    "edit_journal_entry": h._edit_journal_entry,
    "delete_journal_entry": h._delete_journal_entry,
    "delete_list": h._delete_list,

    # Legacy aliases (kept for back-compat with historical tool calls)
    "add_expense": h._add_expense,
    "add_recurring_bill": h._add_recurring_bill,
    "add_goal": h._add_goal,
    "update_goal_progress": h._update_goal_progress,
    "get_upcoming_schedule": h._get_upcoming_schedule,

    # Orphan tools — still registered, still dispatchable
    "set_balance": h._set_balance,
    "add_money": h._add_money,
    "get_balance": h._get_balance,
    "add_grocery_items": h._add_grocery_items,
    "add_task": h._add_task,
    "search_notes": h._search_notes,
    "edit_note": h._edit_note,
    "pin_note": h._pin_note,
    "set_budget": h._set_budget,
    "check_grocery_item": h._check_grocery_item,
    "get_grocery_list": h._get_grocery_list,
    "complete_task": h._complete_task,
    "get_spending_summary": h._get_spending_summary,
    "get_net_worth": h._get_net_worth,
    "get_budget_status": h._get_budget_status,
    "get_spending_recap": h._get_spending_recap,
    "add_custom_category": h._add_custom_category,
    "get_money_left_after_goals": h._get_money_left_after_goals,
    "set_notification_preferences": h._set_notification_preferences,
    "delete_expense": h._delete_expense,
    "delete_event": h._delete_event,
    "delete_task": h._delete_task,
    "edit_expense": h._edit_expense,
    "add_recurring_income": h._add_recurring_income,
    "edit_event": h._edit_event,
    "edit_task": h._edit_task,
    "delete_note": h._delete_note,
    "delete_bill": h._delete_bill,
    "split_expense": h._split_expense,
    "get_spending_patterns": h._get_spending_patterns,
    "search_transactions": h._search_transactions,
    "get_subscription_health": h._get_subscription_health,
    "get_mood_spending_report": h._get_mood_spending_report,
    "create_list": h._create_list,
    "add_list_items": h._add_list_items,
    "get_user_lists": h._get_user_lists,

    # Historical lookup + cross-feature tools
    "get_wellness_history": h._get_wellness_history,
    "compare_periods": h._compare_periods,
    "cross_feature_search": h._cross_feature_search,

    # Health tracking
    "log_health_vital": h._log_health_vital,
    "get_health_vitals": h._get_health_vitals,
    "log_medication": h._log_medication,
    "get_medications": h._get_medications,
    "add_health_appointment": h._add_health_appointment,
    "get_health_appointments": h._get_health_appointments,
    "get_weather": h._get_weather,
    "search_web": h._search_web,
}

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


_TAB_REFRESH_MAP = {
    "log_bill": ["schedule", "forecast"],
    "get_bills": [],
    "log_expense": ["dashboard", "budget"],
    "get_expenses": [],
    "add_calendar_event": ["dashboard", "schedule"],
    "get_calendar": [],
    "add_note": ["notes"],
    "get_notes": [],
    "log_journal_entry": ["notes", "journal"],
    "get_journal": [],
    "create_goal": ["dashboard", "goals"],
    "update_goal": ["dashboard", "goals"],
    "get_goals": [],
    "generate_insights": ["insights"],
    "generate_forecast": ["forecast"],
    "generate_yearly_summary": ["yearly"],

    # Full-CRUD additions
    "edit_bill": ["schedule", "forecast"],
    "delete_goal": ["dashboard", "goals"],
    "edit_journal_entry": ["notes", "journal"],
    "delete_journal_entry": ["notes", "journal"],
    "delete_list": ["lists"],

    # Legacy aliases
    "add_expense": ["dashboard", "budget"],
    "add_recurring_bill": ["schedule", "forecast"],
    "add_goal": ["dashboard", "goals"],
    "update_goal_progress": ["dashboard", "goals"],
    "get_upcoming_schedule": [],

    # Orphan tools
    "set_balance": ["dashboard", "forecast"],
    "add_money": ["dashboard", "budget", "forecast"],
    "get_balance": [],
    "set_budget": ["dashboard", "budget"],
    "add_grocery_items": ["lists", "dashboard"],
    "check_grocery_item": ["lists"],
    "get_grocery_list": [],
    "add_task": ["schedule"],
    "complete_task": ["schedule"],
    "search_notes": [],
    "edit_note": ["notes"],
    "pin_note": ["notes"],
    "get_spending_summary": [],
    "get_net_worth": [],
    "get_budget_status": [],
    "get_spending_recap": [],
    "add_custom_category": ["budget"],
    "get_money_left_after_goals": [],
    "set_notification_preferences": [],
    "delete_expense": ["dashboard", "budget"],
    "delete_event": ["dashboard", "schedule"],
    "delete_task": ["schedule"],
    "edit_expense": ["dashboard", "budget"],
    "add_recurring_income": ["dashboard", "budget", "forecast"],
    "edit_event": ["dashboard", "schedule"],
    "edit_task": ["schedule"],
    "delete_note": ["notes"],
    "delete_bill": ["schedule", "forecast"],
    "split_expense": ["dashboard", "budget"],
    "get_spending_patterns": [],
    "search_transactions": [],
    "get_subscription_health": [],
    "get_mood_spending_report": [],
    "create_list": ["lists"],
    "add_list_items": ["lists"],
    "get_user_lists": [],

    # Historical lookup + cross-feature tools
    "get_wellness_history": [],
    "compare_periods": [],
    "cross_feature_search": [],
    "log_health_vital": [],
    "get_health_vitals": [],
    "log_medication": [],
    "get_medications": [],
    "add_health_appointment": [],
    "get_health_appointments": [],
}


# ─────────────────────────────────────────────────────────────────────────────
def execute_tool(tool_name: str, args: dict, user_id: str) -> tuple[dict, list[str]]:
    """
    Execute a tool by name with the given args for user_id.
    Arguments are normalised in-place (dates -> ISO, amounts -> positive float,
    category / mood / frequency snapped to canonical taxonomy) before dispatch.
    Returns (result_dict, tabs_to_refresh).
    """
    fn = _TOOL_MAP.get(tool_name)
    if fn is None:
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
        result = fn(args, user_id)
        tabs = _TAB_REFRESH_MAP.get(tool_name, [])
        logger.info("Tool %s executed: %s", tool_name, result)
        if is_destructive_tool(tool_name) and not result.get("error"):
            _log_destructive_action(user_id, tool_name, args, result)
        return result, tabs
    except Exception as exc:
        logger.error("Tool %s error: %s", tool_name, exc)
        return {"error": str(exc)}, []


# ─────────────────────────────────────────────────────────────────────────────
