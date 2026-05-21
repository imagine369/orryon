"""Tool handlers — balance."""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timedelta, timezone

from db import (
    delete_row, fetch_rows, get_connection, insert_row, update_row, get_balance, adjust_balance, update_balance, get_or_create_balance_account
)
from core.tools.shared import (
    _current_month,
    _cycle_boundaries,
    _cycle_month_key,
    _ensure_budget_for_cycle,
    _get_category_spending,
    _get_category_spending_cycle,
    _now_iso,
    _prev_cycle_boundaries,
    _reminder_label,
    _today,
    _uid,
    _upsert_budget_template
)

logger = logging.getLogger(__name__)


def _set_budget(args: dict, user_id: str) -> dict:
    month = args.get("month") or _cycle_month_key(user_id)
    category = args["category"]
    amount = float(args["amount"])
    rollover = 1 if args.get("rollover") else 0
    now_ts = _now_iso()
    conn = get_connection()
    existing = conn.execute(
        "SELECT id FROM budget_categories WHERE user_id=? AND category=? AND month=?",
        (user_id, category, month),
    ).fetchone()
    conn.close()
    if existing:
        update_row("budget_categories", {"planned": amount, "rollover": rollover}, {"id": existing["id"]})
    else:
        insert_row("budget_categories", {
            "id": _uid(),
            "user_id": user_id,
            "category": category,
            "planned": amount,
            "month": month,
            "rollover": rollover,
            "created_at": now_ts,
        })

    _upsert_budget_template(user_id, category, amount, rollover)

    spent = _get_category_spending_cycle(user_id, category)
    return {"status": "ok", "category": category, "planned": amount, "spent": spent, "month": month, "rollover": bool(rollover)}
def _set_balance(args: dict, user_id: str) -> dict:
    amount = float(args["amount"])
    update_balance(user_id, amount)
    return {
        "status": "ok",
        "balance": round(amount, 2),
    }
def _add_money(args: dict, user_id: str) -> dict:
    amount = float(args["amount"])
    date = args.get("date") or _today()
    description = args.get("description", "Income")
    import json as _json

    row = {
        "id": _uid(),
        "user_id": user_id,
        "date": date,
        "amount": -amount,  # negative = income
        "merchant": description,
        "description": description,
        "category": "Income",
        "is_recurring": 0,
        "metadata": _json.dumps({"type": "deposit"}),
    }
    insert_row("transactions", row)

    new_bal = adjust_balance(user_id, amount)
    return {
        "status": "ok",
        "id": row["id"],
        "amount_added": round(amount, 2),
        "description": description,
        "date": date,
        "new_balance": round(new_bal, 2),
    }
def _get_balance(args: dict, user_id: str) -> dict:
    bal = get_balance(user_id)
    conn = get_connection()
    goals = conn.execute(
        "SELECT SUM(current_amount) as total FROM goals WHERE user_id=? AND is_completed=0",
        (user_id,),
    ).fetchone()
    bills = conn.execute(
        "SELECT SUM(amount) as total FROM subscriptions "
        "WHERE user_id=? AND is_active=1 AND frequency='monthly'",
        (user_id,),
    ).fetchone()
    conn.close()
    goals_total = float(goals["total"] or 0) if goals else 0
    bills_total = float(bills["total"] or 0) if bills else 0
    free_to_spend = round(bal - goals_total, 2)
    return {
        "balance": round(bal, 2),
        "goals_earmarked": round(goals_total, 2),
        "monthly_bills": round(bills_total, 2),
        "free_to_spend": free_to_spend,
    }
def _get_spending_summary(args: dict, user_id: str) -> dict:
    period = args.get("period", "this_month")
    category_filter = args.get("category", "")
    now = datetime.now()

    if period == "today":
        start = now.strftime("%Y-%m-%d")
        end = start
    elif period == "this_week":
        start = (now - timedelta(days=now.weekday())).strftime("%Y-%m-%d")
        end = now.strftime("%Y-%m-%d")
    elif period == "this_month":
        start, end = _cycle_boundaries(user_id)
    elif period == "last_month":
        start, end = _prev_cycle_boundaries(user_id)
    elif period == "last_7_days":
        start = (now - timedelta(days=7)).strftime("%Y-%m-%d")
        end = now.strftime("%Y-%m-%d")
    else:  # last_30_days
        start = (now - timedelta(days=30)).strftime("%Y-%m-%d")
        end = now.strftime("%Y-%m-%d")

    conn = get_connection()
    if category_filter:
        rows = conn.execute(
            "SELECT * FROM transactions WHERE user_id=? AND date>=? AND date<=? AND category=? AND amount>0",
            (user_id, start, end, category_filter),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM transactions WHERE user_id=? AND date>=? AND date<=? AND amount>0",
            (user_id, start, end),
        ).fetchall()
    conn.close()

    total = sum(r["amount"] for r in rows)
    by_category: dict[str, float] = {}
    for r in rows:
        cat = r["category"] or "Other"
        by_category[cat] = by_category.get(cat, 0) + r["amount"]

    breakdown = sorted(
        [{"category": k, "total": round(v, 2)} for k, v in by_category.items()],
        key=lambda x: x["total"], reverse=True
    )
    return {
        "period": period,
        "start": start,
        "end": end,
        "total": round(total, 2),
        "transaction_count": len(rows),
        "by_category": breakdown,
        "category_filter": category_filter or "all",
    }
def _get_net_worth(args: dict, user_id: str) -> dict:
    bal = get_balance(user_id)
    conn = get_connection()
    goals = conn.execute(
        "SELECT SUM(current_amount) as total FROM goals WHERE user_id=? AND is_completed=0",
        (user_id,),
    ).fetchone()
    conn.close()
    goals_total = float(goals["total"] or 0) if goals else 0
    return {
        "net_worth": round(bal, 2),
        "balance": round(bal, 2),
        "goals_earmarked": round(goals_total, 2),
        "balance_after_goals": round(bal - goals_total, 2),
    }
def _get_budget_status(args: dict, user_id: str) -> dict:
    month = args.get("month") or _cycle_month_key(user_id)
    category_filter = args.get("category", "")

    _ensure_budget_for_cycle(user_id, month)

    conn = get_connection()
    if category_filter:
        budgets = conn.execute(
            "SELECT * FROM budget_categories WHERE user_id=? AND month=? AND category=?",
            (user_id, month, category_filter),
        ).fetchall()
    else:
        budgets = conn.execute(
            "SELECT * FROM budget_categories WHERE user_id=? AND month=?",
            (user_id, month),
        ).fetchall()

    start, end = _cycle_boundaries(user_id)
    txns = conn.execute(
        "SELECT category, SUM(amount) as total FROM transactions "
        "WHERE user_id=? AND date>=? AND date<=? AND amount>0 GROUP BY category",
        (user_id, start, end),
    ).fetchall()
    conn.close()

    spent_map = {r["category"]: round(r["total"], 2) for r in txns}
    result = []
    for b in budgets:
        cat = b["category"]
        spent = spent_map.get(cat, 0)
        planned = b["planned"]
        pct = round((spent / planned * 100) if planned else 0, 1)
        result.append({
            "category": cat,
            "planned": planned,
            "spent": spent,
            "remaining": round(planned - spent, 2),
            "pct_used": pct,
        })
    result.sort(key=lambda x: x["pct_used"], reverse=True)
    return {"month": month, "categories": result}
def _get_spending_recap(args: dict, user_id: str) -> dict:
    period = args.get("period", "this_month")
    now = datetime.now()

    if period == "this_week":
        start = (now - timedelta(days=now.weekday())).strftime("%Y-%m-%d")
        end = now.strftime("%Y-%m-%d")
        prev_start = (now - timedelta(days=now.weekday() + 7)).strftime("%Y-%m-%d")
        prev_end = (now - timedelta(days=now.weekday() + 1)).strftime("%Y-%m-%d")
        label = "This Week"
    elif period == "last_week":
        monday = now - timedelta(days=now.weekday() + 7)
        start = monday.strftime("%Y-%m-%d")
        end = (monday + timedelta(days=6)).strftime("%Y-%m-%d")
        prev_start = (monday - timedelta(days=7)).strftime("%Y-%m-%d")
        prev_end = (monday - timedelta(days=1)).strftime("%Y-%m-%d")
        label = "Last Week"
    elif period == "last_month":
        start, end = _prev_cycle_boundaries(user_id)
        prev_start_dt = datetime.strptime(start, "%Y-%m-%d")
        ps, pe = _prev_cycle_boundaries(user_id, prev_start_dt)
        prev_start, prev_end = ps, pe
        label = "Last Month"
    else:  # this_month
        start, end = _cycle_boundaries(user_id)
        prev_start, prev_end = _prev_cycle_boundaries(user_id)
        label = "This Month"

    conn = get_connection()
    rows = conn.execute(
        "SELECT category, SUM(amount) as total, COUNT(*) as cnt "
        "FROM transactions WHERE user_id=? AND date>=? AND date<=? AND amount>0 GROUP BY category",
        (user_id, start, end),
    ).fetchall()
    prev_rows = conn.execute(
        "SELECT SUM(amount) as total FROM transactions "
        "WHERE user_id=? AND date>=? AND date<=? AND amount>0",
        (user_id, prev_start, prev_end),
    ).fetchone()
    cycle_month = _cycle_month_key(user_id)
    _ensure_budget_for_cycle(user_id, cycle_month)
    budgets = conn.execute(
        "SELECT category, planned FROM budget_categories WHERE user_id=? AND month=?",
        (user_id, cycle_month),
    ).fetchall()
    conn.close()

    total = sum(float(r["total"]) for r in rows)
    prev_total = float(prev_rows["total"] or 0) if prev_rows else 0
    by_cat = sorted([{"category": r["category"], "total": round(float(r["total"]), 2), "count": r["cnt"]} for r in rows], key=lambda x: -x["total"])
    top_cats = by_cat[:3]

    budget_map = {b["category"]: float(b["planned"]) for b in budgets}
    over_budget = [{"category": c["category"], "spent": c["total"], "budget": budget_map[c["category"]], "over_by": round(c["total"] - budget_map[c["category"]], 2)} for c in by_cat if c["category"] in budget_map and c["total"] > budget_map[c["category"]]]

    diff = round(total - prev_total, 2)
    diff_pct = round((diff / prev_total * 100) if prev_total > 0 else 0, 1)

    # Positive insight: find the category that improved most vs prior period
    insight = ""
    if total < prev_total and prev_total > 0:
        insight = f"Great job — you spent ${abs(diff):,.0f} less than the previous period ({abs(diff_pct):.0f}% reduction)! 🎉"
    elif top_cats:
        best_cat = min(by_cat, key=lambda x: x["total"]) if len(by_cat) > 1 else None
        if best_cat:
            insight = f"Your lowest spending category was {best_cat['category']} at ${best_cat['total']:,.0f} — nice restraint there!"
        else:
            insight = "Keep tracking your spending to build better habits over time!"

    return {
        "period": label,
        "start": start,
        "end": end,
        "total_spent": round(total, 2),
        "transaction_count": sum(r["cnt"] for r in rows),
        "top_categories": top_cats,
        "all_categories": by_cat,
        "prev_total": round(prev_total, 2),
        "change_vs_prev": diff,
        "change_pct": diff_pct,
        "over_budget_categories": over_budget,
        "positive_insight": insight,
    }
def _add_custom_category(args: dict, user_id: str) -> dict:
    name = args["name"].strip()
    icon = args.get("icon", "🏷️")
    color = args.get("color", "#6366f1")
    conn = get_connection()
    existing = conn.execute(
        "SELECT id FROM custom_categories WHERE user_id=? AND name=?",
        (user_id, name),
    ).fetchone()
    conn.close()
    if existing:
        return {"status": "already_exists", "name": name, "message": f"Category '{name}' already exists."}
    insert_row("custom_categories", {
        "id": _uid(),
        "user_id": user_id,
        "name": name,
        "color": color,
        "icon": icon,
        "is_active": 1,
        "created_at": _now_iso(),
    })
    return {"status": "ok", "name": name, "icon": icon, "color": color}
def _set_notification_preferences(args: dict, user_id: str) -> dict:
    updates = {}
    messages = []
    if "default_reminder_minutes" in args:
        val = int(args["default_reminder_minutes"])
        updates["default_reminder_minutes"] = val
        messages.append(f"Default reminder set to {_reminder_label(val)}" if val > 0 else "Default reminders turned off")
    if "daily_digest_enabled" in args:
        val = 1 if args["daily_digest_enabled"] else 0
        updates["daily_digest_enabled"] = val
        messages.append("Daily digest enabled" if val else "Daily digest disabled")
    if "daily_digest_time" in args:
        val = args["daily_digest_time"].strip()
        updates["daily_digest_time"] = val
        messages.append(f"Daily digest time set to {val}")

    if not updates:
        return {"status": "no_changes", "message": "No preferences specified."}

    update_row("users", updates, {"id": user_id})
    return {"status": "ok", "changes": messages}
def _add_recurring_income(args: dict, user_id: str) -> dict:
    from db import get_recurring_income, get_total_monthly_income
    row = {
        "id": _uid(),
        "user_id": user_id,
        "name": args["name"],
        "amount": float(args["amount"]),
        "frequency": args.get("frequency", "monthly"),
        "source": args.get("source", ""),
        "next_date": "",
        "is_active": 1,
        "created_at": _now_iso(),
    }
    insert_row("recurring_income", row)
    total = get_total_monthly_income(user_id)
    return {"status": "ok", "id": row["id"], "name": row["name"],
            "amount": row["amount"], "frequency": row["frequency"],
            "total_monthly_income": round(total, 2)}
def _get_money_left_after_goals(args: dict, user_id: str) -> dict:
    month = args.get("month") or _current_month()
    now = datetime.now()

    bal = get_balance(user_id)
    from db import get_total_monthly_income
    monthly_income = get_total_monthly_income(user_id)

    conn = get_connection()
    expense_rows = conn.execute(
        "SELECT SUM(amount) as total FROM transactions WHERE user_id=? AND date LIKE ? AND amount>0",
        (user_id, f"{month}%"),
    ).fetchone()
    bills = conn.execute(
        "SELECT SUM(amount) as total FROM subscriptions WHERE user_id=? AND is_active=1 AND frequency='monthly'",
        (user_id,),
    ).fetchone()
    goals = conn.execute(
        "SELECT * FROM goals WHERE user_id=? AND is_completed=0",
        (user_id,),
    ).fetchall()
    conn.close()

    total_expenses = float(expense_rows["total"] or 0)
    monthly_bills = float(bills["total"] or 0)

    goals_total = 0.0
    goal_details = []
    for g in goals:
        current = float(g["current_amount"])
        goals_total += current
        goal_details.append({"name": g["name"], "saved": round(current, 2),
                             "target": float(g["target_amount"])})

    balance_after_goals = round(bal - goals_total, 2)

    return {
        "month": month,
        "balance": round(bal, 2),
        "monthly_income": round(monthly_income, 2),
        "monthly_bills_total": round(monthly_bills, 2),
        "goals_earmarked": round(goals_total, 2),
        "balance_after_goals": balance_after_goals,
        "spent_so_far": round(total_expenses, 2),
        "goal_breakdown": goal_details,
    }
