"""Human-readable labels for agent tool calls (SSE + logging)."""

from __future__ import annotations

from core.canonical_tools import resolve_tool_name

# Overrides only — unknown tools get a title-cased name from the tool id.
_TOOL_LABELS: dict[str, str] = {
    "log_bill": "Logging bill",
    "get_bills": "Loading bills",
    "log_expense": "Logging expense",
    "get_expenses": "Loading expenses",
    "add_calendar_event": "Adding to calendar",
    "get_calendar": "Loading calendar",
    "add_note": "Saving note",
    "get_notes": "Loading notes",
    "log_journal_entry": "Saving journal entry",
    "get_journal": "Loading journal",
    "create_goal": "Creating goal",
    "update_goal": "Updating goal",
    "get_goals": "Loading goals",
    "generate_insights": "Generating insights",
    "generate_forecast": "Running forecast",
    "generate_yearly_summary": "Building yearly summary",
    "edit_bill": "Updating bill",
    "delete_goal": "Removing goal",
    "edit_journal_entry": "Updating journal entry",
    "delete_journal_entry": "Removing journal entry",
    "delete_list": "Deleting list",
    "set_balance": "Setting balance",
    "add_money": "Adding to balance",
    "get_balance": "Checking balance",
    "add_grocery_items": "Updating grocery list",
    "add_task": "Creating task",
    "set_budget": "Setting budget",
    "check_grocery_item": "Checking off item",
    "complete_task": "Completing task",
    "get_spending_summary": "Checking spending",
    "get_net_worth": "Calculating net worth",
    "get_budget_status": "Checking budgets",
    "get_spending_recap": "Building recap",
    "add_custom_category": "Creating category",
    "get_money_left_after_goals": "Calculating free money",
    "set_notification_preferences": "Updating preferences",
    "delete_expense": "Removing expense",
    "delete_event": "Removing event",
    "delete_task": "Removing task",
    "edit_expense": "Updating expense",
    "add_recurring_income": "Tracking income",
    "edit_event": "Updating event",
    "edit_task": "Updating task",
    "delete_note": "Removing note",
    "search_notes": "Searching notes",
    "edit_note": "Updating note",
    "pin_note": "Pinning note",
    "delete_bill": "Cancelling bill",
    "split_expense": "Splitting expense",
    "get_spending_patterns": "Analysing patterns",
    "search_transactions": "Searching transactions",
    "get_subscription_health": "Checking subscriptions",
    "create_list": "Creating list",
    "add_list_items": "Adding to list",
    "get_user_lists": "Loading lists",
    "get_mood_spending_report": "Analysing mood patterns",
    "get_wellness_history": "Loading wellness history",
    "compare_periods": "Comparing periods",
    "cross_feature_search": "Searching",
    "log_health_vital": "Logging health vital",
    "get_health_vitals": "Loading health vitals",
    "log_medication": "Saving medication",
    "get_medications": "Loading medications",
    "add_health_appointment": "Scheduling appointment",
    "get_health_appointments": "Loading appointments",
    "get_weather": "Checking weather",
    "search_web": "Searching the web",
}

def get_tool_label(tool_name: str) -> str:
    canonical = resolve_tool_name(tool_name)
    return _TOOL_LABELS.get(canonical, canonical.replace("_", " ").title())


def is_destructive_tool(tool_name: str) -> bool:
    return resolve_tool_name(tool_name).startswith("delete_")
