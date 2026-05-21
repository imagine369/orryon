"""
Orryon agent tools — schemas, handlers, registry, and seed data.

Split from the former monolithic core/tools.py for maintainability.
"""
from core.canonical_tools import (
    CANONICAL_TOOL_NAMES,
    filter_schemas_for_grok,
    validate_canonical_schemas,
)
from core.tools.schemas import TOOL_SCHEMAS
from core.tools.registry import execute_tool, _TAB_REFRESH_MAP, _TOOL_MAP

validate_canonical_schemas(TOOL_SCHEMAS)
# Subset sent to Grok on each chat request; full TOOL_SCHEMAS kept for tests/docs.
GROK_TOOL_SCHEMAS = filter_schemas_for_grok(TOOL_SCHEMAS)
from core.tools.seed import seed_sample_data
from core.tools.helpers import (
    _uid,
    _now_iso,
    _today,
    _cycle_boundaries,
    _cycle_month_key,
    _ensure_budget_for_cycle,
    _upsert_budget_template,
    _check_spending_alert,
    _get_category_spending_cycle,
    _get_category_budget,
    _get_spending_recap,
    _get_balance,
    _get_spending_summary,
    _get_goals,
    _get_upcoming_schedule,
    _get_budget_status,
    _get_expenses,
    _get_bills,
    _get_notes,
)

__all__ = [
    "TOOL_SCHEMAS",
    "GROK_TOOL_SCHEMAS",
    "CANONICAL_TOOL_NAMES",
    "execute_tool",
    "seed_sample_data",
    "_TOOL_MAP",
    "_TAB_REFRESH_MAP",
    "_uid",
    "_now_iso",
    "_today",
    "_cycle_boundaries",
    "_cycle_month_key",
    "_ensure_budget_for_cycle",
    "_upsert_budget_template",
    "_check_spending_alert",
    "_get_category_spending_cycle",
    "_get_category_budget",
    "_get_spending_recap",
    "_get_balance",
    "_get_spending_summary",
    "_get_goals",
    "_get_upcoming_schedule",
    "_get_budget_status",
    "_get_expenses",
    "_get_bills",
    "_get_notes",
]
