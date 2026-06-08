"""
Agent context snapshot — financial and schedule summary injected into the system prompt.
"""
from __future__ import annotations

import logging

from core.user_locale import get_user_locale

logger = logging.getLogger(__name__)


def compute_context_snapshot(user_id: str) -> str:
    try:
        from core.tools import (
            _get_spending_summary,
            _get_budget_status,
            _get_goals,
            _get_upcoming_schedule,
            _get_balance,
        )
        from db import get_total_monthly_income

        locale = get_user_locale(user_id)
        fmt = locale.format_money

        bal_data = _get_balance({}, user_id)
        spend = _get_spending_summary({"period": "this_month"}, user_id)
        budget = _get_budget_status({}, user_id)
        goals = _get_goals({}, user_id)
        schedule = _get_upcoming_schedule({"days": 7}, user_id)
        monthly_income = get_total_monthly_income(user_id)

        lines = [
            f"- Balance: {fmt(bal_data['balance'])}",
            f"- Goals earmarked: {fmt(bal_data['goals_earmarked'])}",
            f"- Free to spend (balance after goals): {fmt(bal_data['free_to_spend'])}",
            f"- Monthly income: {fmt(monthly_income)}" if monthly_income > 0 else "- Monthly income: not set",
            f"- Monthly bills: {fmt(bal_data['monthly_bills'])}",
            f"- This month's spending: {fmt(spend['total'])} ({spend['transaction_count']} transactions)",
        ]
        for cat in spend.get("by_category", [])[:3]:
            lines.append(f"  . {cat['category']}: {fmt(cat['total'])}")
        for b in budget.get("categories", [])[:3]:
            lines.append(
                f"  . Budget {b['category']}: {fmt(b['spent'])}/{fmt(b['planned'])} ({b['pct_used']}%)"
            )
        if goals.get("goals"):
            lines.append("- Goals:")
            for g in goals["goals"][:3]:
                lines.append(
                    f"  . {g['name']}: {fmt(g['current_amount'])}/{fmt(g['target_amount'])} ({g['pct_complete']}%)"
                )
        if schedule.get("items"):
            lines.append("- Upcoming (7 days):")
            for item in schedule["items"][:5]:
                amt = f" {fmt(item['amount'])}" if item.get("amount") else ""
                lines.append(f"  . [{item['type']}] {item['title']} — {item.get('date', '')}{amt}")

        try:
            from db import get_connection
            conn = get_connection()
            recent_notes = conn.execute(
                "SELECT id, title, mood, is_pinned FROM notes "
                "WHERE user_id=? ORDER BY is_pinned DESC, updated_at DESC LIMIT 5",
                (user_id,),
            ).fetchall()
            conn.close()
            if recent_notes:
                lines.append("- Recent notes:")
                for n in recent_notes:
                    n = dict(n)
                    pin = " pinned" if n.get("is_pinned") else ""
                    mood = f" ({n['mood']})" if n.get("mood") else ""
                    lines.append(f"  . [{n['id'][:8]}] {n['title']}{pin}{mood}")
        except Exception:
            pass

        return "\n".join(lines)
    except Exception as exc:
        logger.warning("Context snapshot failed: %s", exc)
        return "(context unavailable)"
