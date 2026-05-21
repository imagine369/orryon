"""Shared utilities for tool handlers."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from db import get_connection, insert_row, update_row

def _today() -> str:
    return datetime.now().strftime("%Y-%m-%d")
def _current_month() -> str:
    return datetime.now().strftime("%Y-%m")
def _get_cycle_day(user_id: str) -> int:
    """Return the user's budget_cycle_start day (1-28), defaulting to 1."""
    conn = get_connection()
    row = conn.execute(
        "SELECT budget_cycle_start FROM users WHERE id=?", (user_id,)
    ).fetchone()
    conn.close()
    if row:
        val = row["budget_cycle_start"] if isinstance(row, dict) else row[0]
        if val and 1 <= int(val) <= 28:
            return int(val)
    return 1
def _cycle_boundaries(user_id: str, ref: datetime | None = None) -> tuple[str, str]:
    """Return (start_date, end_date) for the user's current budget cycle.

    If cycle_day == 1 this is identical to calendar month boundaries.
    If cycle_day == 15, the cycle runs from the 15th of one month to the 14th
    of the next.
    """
    ref = ref or datetime.now()
    day = _get_cycle_day(user_id)
    if ref.day >= day:
        start = ref.replace(day=day)
    else:
        prev = ref.replace(day=1) - timedelta(days=1)
        start = prev.replace(day=min(day, prev.day))
    next_month = (start + timedelta(days=32)).replace(day=1)
    end = next_month.replace(day=min(day, 28)) - timedelta(days=1)
    return start.strftime("%Y-%m-%d"), min(end, ref).strftime("%Y-%m-%d")
def _cycle_month_key(user_id: str, ref: datetime | None = None) -> str:
    """Return a YYYY-MM key representing the budget cycle that contains *ref*.

    Uses the cycle start date's month so budget_categories rows line up."""
    start_str, _ = _cycle_boundaries(user_id, ref)
    return start_str[:7]
def _prev_cycle_boundaries(user_id: str, ref: datetime | None = None) -> tuple[str, str]:
    """Return (start_date, end_date) for the previous budget cycle."""
    ref = ref or datetime.now()
    cur_start_str, _ = _cycle_boundaries(user_id, ref)
    cur_start = datetime.strptime(cur_start_str, "%Y-%m-%d")
    prev_ref = cur_start - timedelta(days=1)
    return _cycle_boundaries(user_id, prev_ref)
def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
def _uid() -> str:
    return str(uuid.uuid4())
def _get_goal_impact_for_category(user_id: str, category: str, month: str) -> dict | None:
    """Return goal impact data if any active goal is linked to this expense category."""
    conn = get_connection()
    goals = conn.execute(
        "SELECT * FROM goals WHERE user_id=? AND is_completed=0 AND linked_budget_category=?",
        (user_id, category),
    ).fetchall()
    conn.close()
    if not goals:
        return None
    g = dict(goals[0])
    target = float(g["target_amount"])
    current = float(g["current_amount"])
    remaining = round(target - current, 2)
    pct = round((current / target * 100), 1) if target else 0
    monthly_needed = None
    months_left = None
    if g.get("target_date"):
        try:
            target_dt = datetime.strptime(g["target_date"], "%Y-%m-%d")
            months_left = max(1, round((target_dt - datetime.now()).days / 30))
            monthly_needed = round(remaining / months_left, 2)
        except Exception:
            pass
    return {
        "goal_name": g["name"],
        "pct_complete": pct,
        "remaining": round(remaining, 2),
        "monthly_needed": monthly_needed,
        "months_left": months_left,
        "target_date": g.get("target_date", ""),
    }
def _upsert_budget_template(user_id: str, category: str, planned: float, rollover: int = 0) -> None:
    """Persist the budget category as a reusable template ("set once, carry forever")."""
    conn = get_connection()
    existing = conn.execute(
        "SELECT id FROM budget_templates WHERE user_id=? AND category=?",
        (user_id, category),
    ).fetchone()
    conn.close()
    now_ts = _now_iso()
    if existing:
        eid = existing["id"] if isinstance(existing, dict) else existing[0]
        update_row("budget_templates", {"planned": planned, "rollover": rollover, "updated_at": now_ts}, {"id": eid})
    else:
        insert_row("budget_templates", {
            "id": _uid(), "user_id": user_id, "category": category,
            "planned": planned, "rollover": rollover,
            "created_at": now_ts, "updated_at": now_ts,
        })
def _ensure_budget_for_cycle(user_id: str, month_key: str) -> None:
    """Auto-carry budget templates into a new cycle month if no rows exist yet."""
    conn = get_connection()
    existing = conn.execute(
        "SELECT COUNT(*) as cnt FROM budget_categories WHERE user_id=? AND month=?",
        (user_id, month_key),
    ).fetchone()
    cnt = existing["cnt"] if isinstance(existing, dict) else existing[0]
    if cnt > 0:
        conn.close()
        return
    templates = conn.execute(
        "SELECT category, planned, rollover FROM budget_templates WHERE user_id=?",
        (user_id,),
    ).fetchall()
    conn.close()
    now_ts = _now_iso()
    for t in templates:
        cat = t["category"] if isinstance(t, dict) else t[0]
        planned = t["planned"] if isinstance(t, dict) else t[1]
        roll = t["rollover"] if isinstance(t, dict) else t[2]
        insert_row("budget_categories", {
            "id": _uid(), "user_id": user_id, "category": cat,
            "planned": float(planned), "month": month_key,
            "rollover": int(roll), "created_at": now_ts,
        })
def _reminder_label(minutes: int) -> str:
    """Human-readable label for a reminder_minutes value."""
    if minutes <= 0:
        return "none"
    if minutes < 60:
        return f"{minutes} min before"
    if minutes < 1440:
        return f"{minutes // 60} hour{'s' if minutes >= 120 else ''} before"
    return "1 day before"
def _get_category_spending(user_id: str, category: str, month: str) -> float:
    conn = get_connection()
    row = conn.execute(
        "SELECT SUM(amount) as total FROM transactions "
        "WHERE user_id=? AND category=? AND date LIKE ? AND amount>0",
        (user_id, category, f"{month}%"),
    ).fetchone()
    conn.close()
    return round(float(row["total"] or 0), 2)
def _get_category_spending_cycle(user_id: str, category: str, ref: datetime | None = None) -> float:
    """Spending in a category within the user's current budget cycle."""
    start, end = _cycle_boundaries(user_id, ref)
    conn = get_connection()
    row = conn.execute(
        "SELECT COALESCE(SUM(amount),0) as total FROM transactions "
        "WHERE user_id=? AND category=? AND date>=? AND date<=? AND amount>0",
        (user_id, category, start, end),
    ).fetchone()
    conn.close()
    return round(float(row["total"] or 0), 2)
def _get_category_budget(user_id: str, category: str, month: str) -> float:
    conn = get_connection()
    row = conn.execute(
        "SELECT planned FROM budget_categories WHERE user_id=? AND category=? AND month=?",
        (user_id, category, month),
    ).fetchone()
    conn.close()
    return float(row["planned"]) if row else 0.0
def _check_spending_alert(user_id: str, category: str, spent: float, budget: float) -> dict | None:
    """Return an alert dict if category spending has crossed the user's threshold."""
    if budget <= 0:
        return None
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT spending_alert_pct FROM users WHERE id=?", (user_id,)
        ).fetchone()
    except Exception:
        row = None
    conn.close()
    threshold_pct = 80
    if row:
        val = row["spending_alert_pct"] if isinstance(row, dict) else row[0]
        if val is not None:
            threshold_pct = int(val)
    pct_used = round(spent / budget * 100, 1)
    if pct_used >= 100:
        return {
            "level": "over_budget",
            "message": f"You've exceeded your {category} budget — ${spent:,.0f} of ${budget:,.0f} ({pct_used:.0f}%).",
            "category": category, "spent": spent, "budget": budget, "pct_used": pct_used,
        }
    if pct_used >= threshold_pct:
        return {
            "level": "warning",
            "message": f"Heads up — you've used {pct_used:.0f}% of your {category} budget (${spent:,.0f} of ${budget:,.0f}).",
            "category": category, "spent": spent, "budget": budget, "pct_used": pct_used,
        }
    return None
def _get_custom_categories(user_id: str) -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM custom_categories WHERE user_id=? AND is_active=1 ORDER BY name",
        (user_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


__all__ = [
    "_today",
    "_current_month",
    "_get_cycle_day",
    "_cycle_boundaries",
    "_cycle_month_key",
    "_prev_cycle_boundaries",
    "_now_iso",
    "_uid",
    "_get_goal_impact_for_category",
    "_upsert_budget_template",
    "_ensure_budget_for_cycle",
    "_reminder_label",
    "_get_category_spending",
    "_get_category_spending_cycle",
    "_get_category_budget",
    "_check_spending_alert",
    "_get_custom_categories",
]
