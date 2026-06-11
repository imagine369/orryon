"""OpenAI-compatible tool schemas sent to Grok (aggregated by domain)."""
from __future__ import annotations

from core.tools.schemas.expenses import SCHEMAS as EXPENSES_SCHEMAS
from core.tools.schemas.bills import SCHEMAS as BILLS_SCHEMAS
from core.tools.schemas.calendar import SCHEMAS as CALENDAR_SCHEMAS
from core.tools.schemas.notes import SCHEMAS as NOTES_SCHEMAS
from core.tools.schemas.goals import SCHEMAS as GOALS_SCHEMAS
from core.tools.schemas.lists import SCHEMAS as LISTS_SCHEMAS
from core.tools.schemas.balance import SCHEMAS as BALANCE_SCHEMAS
from core.tools.schemas.analysis import SCHEMAS as ANALYSIS_SCHEMAS
from core.tools.schemas.health import SCHEMAS as HEALTH_SCHEMAS
from core.tools.schemas.world import SCHEMAS as WORLD_SCHEMAS
from core.tools.schemas.fulfillment import SCHEMAS as FULFILLMENT_SCHEMAS

_ALL = (
    EXPENSES_SCHEMAS
    + BILLS_SCHEMAS
    + CALENDAR_SCHEMAS
    + NOTES_SCHEMAS
    + GOALS_SCHEMAS
    + LISTS_SCHEMAS
    + BALANCE_SCHEMAS
    + ANALYSIS_SCHEMAS
    + HEALTH_SCHEMAS
    + WORLD_SCHEMAS
    + FULFILLMENT_SCHEMAS
)

# Preserve legacy monolith order for stable diffs and any order-sensitive tests.
_LEGACY_ORDER = (
    "log_expense",
    "add_calendar_event",
    "add_grocery_items",
    "delete_grocery_items",
    "log_bill",
    "add_task",
    "add_note",
    "set_budget",
    "check_grocery_item",
    "uncheck_grocery_item",
    "complete_task",
    "get_spending_summary",
    "get_net_worth",
    "set_balance",
    "add_money",
    "get_balance",
    "get_grocery_list",
    "get_calendar",
    "get_budget_status",
    "create_goal",
    "update_goal",
    "get_goals",
    "get_spending_recap",
    "add_custom_category",
    "get_money_left_after_goals",
    "set_notification_preferences",
    "edit_expense",
    "add_recurring_income",
    "edit_event",
    "edit_task",
    "delete_note",
    "search_notes",
    "edit_note",
    "pin_note",
    "delete_bill",
    "split_expense",
    "get_spending_patterns",
    "search_transactions",
    "delete_expense",
    "delete_event",
    "delete_task",
    "get_subscription_health",
    "get_mood_spending_report",
    "create_list",
    "add_list_items",
    "get_user_lists",
    "get_bills",
    "get_expenses",
    "get_notes",
    "log_journal_entry",
    "get_journal",
    "generate_insights",
    "generate_forecast",
    "generate_yearly_summary",
    "edit_bill",
    "delete_goal",
    "edit_journal_entry",
    "delete_journal_entry",
    "delete_list",
    "get_wellness_history",
    "compare_periods",
    "cross_feature_search",
    "log_health_vital",
    "get_health_vitals",
    "log_medication",
    "get_medications",
    "add_health_appointment",
    "get_health_appointments",
    "get_weather",
    "search_web",
    "create_fulfillment_handoff",
    "get_video_calls",
    "get_emails",
)

_by_name = {s["function"]["name"]: s for s in _ALL}
TOOL_SCHEMAS: list[dict] = [_by_name[n] for n in _LEGACY_ORDER]
if len(TOOL_SCHEMAS) != len(_ALL):
    raise RuntimeError("duplicate tool name in schema modules")
