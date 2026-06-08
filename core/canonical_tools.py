"""
core/canonical_tools.py — Single source of truth for agent-callable tool names.

Used by system_prompt.py and grok_agent soft-reprompt. Legacy aliases remain
in core.tools._TOOL_MAP for historical tool-call IDs but are not advertised.
"""

from __future__ import annotations

# Names sent to Grok in TOOL_SCHEMAS and taught in the system prompt.
CANONICAL_TOOL_NAMES: tuple[str, ...] = (
    # Bills
    "log_bill", "get_bills", "edit_bill", "delete_bill",
    # Expenses
    "log_expense", "get_expenses", "edit_expense", "delete_expense", "split_expense",
    # Calendar
    "add_calendar_event", "get_calendar", "edit_event", "delete_event",
    # Notes
    "add_note", "get_notes", "search_notes", "edit_note", "pin_note", "delete_note",
    # Journal
    "log_journal_entry", "get_journal", "edit_journal_entry", "delete_journal_entry",
    # Goals
    "create_goal", "get_goals", "update_goal", "delete_goal",
    # Tasks
    "add_task", "edit_task", "complete_task", "delete_task",
    # Lists & grocery
    "create_list", "get_user_lists", "add_list_items", "delete_list",
    "add_grocery_items", "check_grocery_item", "get_grocery_list",
    # Analysis
    "generate_insights", "generate_forecast", "generate_yearly_summary",
    # Balance & budget helpers (read/write)
    "set_balance", "add_money", "get_balance",
    "set_budget", "get_budget_status", "get_spending_summary",
    "get_spending_recap", "get_spending_patterns", "get_money_left_after_goals",
    "add_custom_category", "set_notification_preferences",
    # Cross-feature & search
    "get_wellness_history", "compare_periods", "cross_feature_search",
    "search_transactions",
    "get_net_worth", "get_subscription_health", "get_mood_spending_report",
    "add_recurring_income",
    # Health tracking
    "log_health_vital", "get_health_vitals",
    "log_medication", "get_medications",
    "add_health_appointment", "get_health_appointments",
    # World / live context
    "get_weather",
    "search_web",
)

# Legacy names from old chat sessions — resolved at dispatch, not advertised to Grok.
LEGACY_TOOL_ALIASES: dict[str, str] = {
    "add_expense": "log_expense",
    "add_recurring_bill": "log_bill",
    "add_goal": "create_goal",
    "update_goal_progress": "update_goal",
    "get_upcoming_schedule": "get_calendar",
}


def resolve_tool_name(name: str) -> str:
    """Map legacy tool-call IDs to canonical registry names."""
    return LEGACY_TOOL_ALIASES.get(name, name)


def filter_schemas_for_grok(all_schemas: list[dict]) -> list[dict]:
    """Return canonical tool schemas for the xAI API (smaller payload, fewer hallucinations)."""
    allowed = frozenset(CANONICAL_TOOL_NAMES)
    return [s for s in all_schemas if s.get("function", {}).get("name") in allowed]


def validate_canonical_schemas(all_schemas: list[dict]) -> None:
    """Fail fast at import if prompt/dispatcher/schema sets diverge."""
    by_name = {s["function"]["name"]: s for s in all_schemas}
    missing = [n for n in CANONICAL_TOOL_NAMES if n not in by_name]
    if missing:
        raise RuntimeError(
            f"CANONICAL_TOOL_NAMES missing TOOL_SCHEMAS entries: {missing}"
        )

_REPROMPT_SECTIONS = (
    "BILLS: log_bill, get_bills, edit_bill, delete_bill",
    "EXPENSES: log_expense, get_expenses, edit_expense, delete_expense, split_expense",
    "CALENDAR: add_calendar_event, get_calendar, edit_event, delete_event",
    "NOTES: add_note, get_notes, search_notes, edit_note, pin_note, delete_note",
    "JOURNAL: log_journal_entry, get_journal, edit_journal_entry, delete_journal_entry",
    "GOALS: create_goal, get_goals, update_goal, delete_goal",
    "TASKS: add_task, edit_task, complete_task, delete_task",
    "LISTS: create_list, get_user_lists, add_list_items, delete_list, "
    "add_grocery_items, check_grocery_item, get_grocery_list",
    "ANALYSIS: generate_insights, generate_forecast, generate_yearly_summary",
    "BALANCE/BUDGET: set_balance, add_money, get_balance, set_budget, get_budget_status, "
    "get_spending_summary, get_spending_recap, get_spending_patterns",
    "HEALTH: log_health_vital, get_health_vitals, log_medication, get_medications, "
    "add_health_appointment, get_health_appointments; "
    "WORLD: get_weather, search_web",
)


def build_reprompt_note() -> str:
    sections = "; ".join(_REPROMPT_SECTIONS)
    n = len(CANONICAL_TOOL_NAMES)
    return (
        f"SYSTEM CORRECTION: The previous user turn required a tool call from the "
        f"{n} registered tools ({sections}). "
        "You produced no tool call and did not ask a clarifying question. Either "
        "call the correct tool now with extracted arguments (ISO dates, positive "
        "amounts, canonical category/mood, resolved IDs for edit/delete via the "
        "matching read tool), OR ask ONE clarifying question if intent is truly "
        "ambiguous. Do not apologise — just act."
    )
