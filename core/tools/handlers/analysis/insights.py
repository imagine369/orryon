"""Composite insights, forecast, and yearly summary handlers."""
from __future__ import annotations

import logging

from core.tools.handlers.balance import (
    _get_balance,
    _get_budget_status,
    _get_money_left_after_goals,
    _get_spending_summary,
)
from core.tools.handlers.bills import _get_bills
from core.tools.handlers.calendar import _get_upcoming_schedule
from core.tools.handlers.expenses import _get_expenses, _get_spending_patterns
from core.tools.handlers.goals import _get_goals
from core.tools.handlers.notes import _get_journal
from core.tools.handlers.analysis.reports import (
    _get_mood_spending_report,
    _get_subscription_health,
)
from core.tools.handlers.analysis.history import _get_wellness_history
from core.tools.shared import _current_month

logger = logging.getLogger(__name__)

def _generate_insights(args: dict, user_id: str) -> dict:
    """Composite analytical view combining spending, budget, patterns, goals, and wellness."""
    scope = set(args.get("scope") or ["expenses", "bills", "goals"])
    focus = args.get("focus") or "general"
    date_range = args.get("date_range") or {}
    month = _current_month()
    if date_range.get("from"):
        month = str(date_range["from"])[:7]

    result: dict = {"status": "ok", "focus": focus, "scope": list(scope), "sections": {}}
    try:
        if "expenses" in scope:
            result["sections"]["spending_summary"] = _get_spending_summary(
                {"month": month}, user_id
            )
            result["sections"]["budget_status"] = _get_budget_status(
                {"month": month}, user_id
            )
            result["sections"]["patterns"] = _get_spending_patterns({}, user_id)
        if "bills" in scope:
            result["sections"]["subscription_health"] = _get_subscription_health(
                {}, user_id
            )
        if "goals" in scope:
            result["sections"]["goals"] = _get_goals({}, user_id)
            result["sections"]["money_left_after_goals"] = _get_money_left_after_goals(
                {}, user_id
            )
        if "journal" in scope:
            result["sections"]["mood_spending"] = _get_mood_spending_report({}, user_id)
        if "wellness" in scope:
            result["sections"]["wellness"] = _get_wellness_history(
                {"date_from": date_range.get("from"), "date_to": date_range.get("to")},
                user_id,
            )
    except Exception as e:  # pragma: no cover - defensive
        logger.error("generate_insights partial failure: %s", e)
        result["partial_error"] = str(e)
    return result
def _generate_forecast(args: dict, user_id: str) -> dict:
    """Forward-looking projection blending balance, bills, and goal targets."""
    try:
        horizon = int(args.get("horizon_days") or 30)
    except (TypeError, ValueError):
        horizon = 30
    horizon = max(7, min(horizon, 365))
    scope = set(args.get("scope") or ["expenses", "bills", "goals"])
    scenario = args.get("scenario") or "baseline"
    assumptions = args.get("assumptions") or []

    balance = _get_balance({}, user_id)
    upcoming = _get_upcoming_schedule({"days": horizon}, user_id)
    goals_info = _get_money_left_after_goals({}, user_id) if "goals" in scope else None

    scheduled_bill_total = 0.0
    try:
        items_iter = (upcoming or {}).get("items", []) if isinstance(upcoming, dict) else []
        for item in items_iter:
            if item.get("type") == "bill":
                scheduled_bill_total += float(item.get("amount") or 0)
    except Exception:
        pass

    current = float((balance or {}).get("balance", 0) or 0)
    projected = current - scheduled_bill_total
    if scenario == "pessimistic":
        projected -= 0.10 * max(scheduled_bill_total, 0)
    elif scenario == "optimistic":
        projected += 0.10 * max(scheduled_bill_total, 0)

    return {
        "status": "ok",
        "horizon_days": horizon,
        "scenario": scenario,
        "scope": list(scope),
        "assumptions": list(assumptions),
        "current_balance": round(current, 2),
        "scheduled_outflows": round(scheduled_bill_total, 2),
        "projected_balance": round(projected, 2),
        "upcoming": upcoming,
        "goal_impact": goals_info,
    }
def _generate_yearly_summary(args: dict, user_id: str) -> dict:
    """Year-in-review across selected sections."""
    try:
        year = int(args["year"])
    except (KeyError, TypeError, ValueError):
        return {"status": "error", "message": "year (4-digit integer) is required."}
    sections = set(args.get("sections") or ["expenses", "bills", "goals"])
    date_from = f"{year}-01-01"
    date_to = f"{year}-12-31"

    summary: dict = {"status": "ok", "year": year, "sections": {}}
    if "expenses" in sections:
        summary["sections"]["expenses"] = _get_expenses(
            {"date_range": {"from": date_from, "to": date_to}, "limit": 500}, user_id
        )
    if "bills" in sections:
        summary["sections"]["bills"] = _get_bills(
            {"date_range": {"from": date_from, "to": date_to}, "status": "all"}, user_id
        )
    if "goals" in sections:
        summary["sections"]["goals"] = _get_goals({"include_completed": True}, user_id)
    if "journal" in sections:
        summary["sections"]["journal"] = _get_journal(
            {"date_range": {"from": date_from, "to": date_to}, "limit": 200}, user_id
        )
    if "calendar" in sections:
        summary["sections"]["calendar"] = _get_upcoming_schedule({"days": 365}, user_id)
    return summary
