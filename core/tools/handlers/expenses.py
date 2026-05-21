"""Tool handlers — expenses."""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timedelta, timezone

from db import (
    delete_row, fetch_rows, get_connection, insert_row, update_row, get_balance, adjust_balance, update_balance, get_or_create_balance_account
)
from core.tools.shared import (
    _check_spending_alert,
    _cycle_month_key,
    _ensure_budget_for_cycle,
    _get_category_budget,
    _get_category_spending,
    _get_category_spending_cycle,
    _get_goal_impact_for_category,
    _today,
    _uid
)

logger = logging.getLogger(__name__)


def _add_expense(args: dict, user_id: str) -> dict:
    date = args.get("date") or _today()
    import json as _json
    merchant = args.get("merchant") or args.get("description") or "Unknown"
    description = args.get("description") or args.get("merchant") or ""
    row = {
        "id": _uid(),
        "user_id": user_id,
        "date": date,
        "amount": float(args["amount"]),
        "merchant": merchant,
        "description": description,
        "category": args.get("category", "Other"),
        "is_recurring": 0,
        "metadata": _json.dumps({"notes": args.get("notes", "")}),
    }
    insert_row("transactions", row)
    new_bal = adjust_balance(user_id, -row["amount"])
    category = args.get("category", "Other")
    cycle_month = _cycle_month_key(user_id)
    _ensure_budget_for_cycle(user_id, cycle_month)
    spent = _get_category_spending_cycle(user_id, category)
    budget = _get_category_budget(user_id, category, cycle_month)
    goal_impact = _get_goal_impact_for_category(user_id, category, cycle_month)

    alert = _check_spending_alert(user_id, category, spent, budget)

    result: dict = {
        "status": "ok",
        "id": row["id"],
        "amount": row["amount"],
        "merchant": row["merchant"],
        "category": row["category"],
        "date": date,
        "month_spent": spent,
        "month_budget": budget,
        "new_balance": round(new_bal, 2),
        "goal_impact": goal_impact,
    }
    if alert:
        result["spending_alert"] = alert
    return result
def _delete_expense(args: dict, user_id: str) -> dict:
    expense_id = args["expense_id"]
    conn = get_connection()
    row = conn.execute(
        "SELECT id, merchant, amount FROM transactions WHERE id=? AND user_id=?",
        (expense_id, user_id),
    ).fetchone()
    conn.close()
    if not row:
        return {"status": "not_found", "message": "Expense not found."}
    amt = float(row["amount"])
    delete_row("transactions", {"id": expense_id, "user_id": user_id})
    if amt > 0:
        new_bal = adjust_balance(user_id, amt)  # refund expense
    elif amt < 0:
        new_bal = adjust_balance(user_id, amt)  # remove income
    else:
        new_bal = get_balance(user_id)
    return {"status": "ok", "deleted": row["merchant"], "amount": amt, "new_balance": round(new_bal, 2)}
def _edit_expense(args: dict, user_id: str) -> dict:
    eid = args["expense_id"]
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM transactions WHERE id=? AND user_id=?", (eid, user_id)
    ).fetchone()
    conn.close()
    if not row:
        return {"status": "not_found", "message": "Expense not found."}
    updates = {}
    if "amount" in args:
        updates["amount"] = float(args["amount"])
    if "merchant" in args:
        updates["merchant"] = args["merchant"]
        updates["description"] = args["merchant"]
    if "category" in args:
        updates["category"] = args["category"]
    if "date" in args:
        updates["date"] = args["date"]
    if not updates:
        return {"status": "no_changes", "message": "No fields to update."}
    old_amount = float(row["amount"])
    new_amount = updates.get("amount", old_amount)
    if old_amount > 0 and new_amount != old_amount:
        diff = old_amount - new_amount  # positive if amount decreased (refund), negative if increased
        adjust_balance(user_id, diff)
    update_row("transactions", updates, {"id": eid})
    new_bal = get_balance(user_id)
    return {"status": "ok", "id": eid, "updated": list(updates.keys()),
            "merchant": updates.get("merchant", row["merchant"]),
            "amount": updates.get("amount", row["amount"]),
            "new_balance": round(new_bal, 2)}
def _split_expense(args: dict, user_id: str) -> dict:
    total = float(args["amount"])
    split_count = int(args.get("split_count", 2))
    user_share = round(total / split_count, 2)
    date = args.get("date") or _today()
    import json as _json
    row = {
        "id": _uid(),
        "user_id": user_id,
        "date": date,
        "amount": user_share,
        "merchant": args.get("merchant", "Split expense"),
        "description": f"Split {split_count} ways with {args.get('split_with', 'others')}",
        "category": args.get("category", "Other"),
        "is_recurring": 0,
        "metadata": _json.dumps({
            "split": True, "full_amount": total,
            "split_count": split_count, "split_with": args.get("split_with", ""),
        }),
    }
    insert_row("transactions", row)
    new_bal = adjust_balance(user_id, -user_share)
    return {
        "status": "ok", "id": row["id"],
        "full_amount": total, "your_share": user_share,
        "split_count": split_count, "split_with": args.get("split_with", ""),
        "merchant": row["merchant"], "category": row["category"],
        "new_balance": round(new_bal, 2),
    }
def _get_spending_patterns(args: dict, user_id: str) -> dict:
    months_back = int(args.get("months", 3))
    now = datetime.now()
    start = (now - timedelta(days=months_back * 30)).strftime("%Y-%m-%d")
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM transactions WHERE user_id=? AND date>=? AND amount>0 ORDER BY date ASC",
        (user_id, start),
    ).fetchall()
    conn.close()

    weekday_total = 0.0
    weekend_total = 0.0
    weekday_count = 0
    weekend_count = 0
    monthly_totals: dict[str, float] = {}
    cat_totals: dict[str, float] = {}

    for r in rows:
        amt = float(r["amount"])
        try:
            d = datetime.strptime(r["date"], "%Y-%m-%d")
            if d.weekday() < 5:
                weekday_total += amt
                weekday_count += 1
            else:
                weekend_total += amt
                weekend_count += 1
            month_key = d.strftime("%Y-%m")
            monthly_totals[month_key] = monthly_totals.get(month_key, 0) + amt
        except ValueError:
            pass
        cat = r["category"] or "Other"
        cat_totals[cat] = cat_totals.get(cat, 0) + amt

    months_sorted = sorted(monthly_totals.keys())
    mom_changes = []
    for i in range(1, len(months_sorted)):
        prev = monthly_totals[months_sorted[i - 1]]
        curr = monthly_totals[months_sorted[i]]
        change = curr - prev
        pct = round(change / prev * 100, 1) if prev > 0 else 0
        mom_changes.append({"month": months_sorted[i], "change": round(change, 2), "pct": pct})

    biggest_cat_increase = None
    if len(months_sorted) >= 2:
        last_month = months_sorted[-1]
        prev_month = months_sorted[-2]
        last_by_cat: dict[str, float] = {}
        prev_by_cat: dict[str, float] = {}
        for r in rows:
            if r["date"][:7] == last_month:
                c = r["category"] or "Other"
                last_by_cat[c] = last_by_cat.get(c, 0) + float(r["amount"])
            elif r["date"][:7] == prev_month:
                c = r["category"] or "Other"
                prev_by_cat[c] = prev_by_cat.get(c, 0) + float(r["amount"])
        max_increase = 0
        for cat in last_by_cat:
            inc = last_by_cat[cat] - prev_by_cat.get(cat, 0)
            if inc > max_increase:
                max_increase = inc
                biggest_cat_increase = {"category": cat, "increase": round(inc, 2),
                                        "current": round(last_by_cat[cat], 2),
                                        "previous": round(prev_by_cat.get(cat, 0), 2)}

    return {
        "period_months": months_back,
        "total_transactions": len(rows),
        "weekday_avg": round(weekday_total / max(weekday_count, 1), 2),
        "weekend_avg": round(weekend_total / max(weekend_count, 1), 2),
        "weekday_total": round(weekday_total, 2),
        "weekend_total": round(weekend_total, 2),
        "monthly_totals": {k: round(v, 2) for k, v in monthly_totals.items()},
        "month_over_month": mom_changes,
        "biggest_category_increase": biggest_cat_increase,
        "top_categories": sorted(
            [{"category": k, "total": round(v, 2)} for k, v in cat_totals.items()],
            key=lambda x: -x["total"]
        )[:10],
    }
def _search_transactions(args: dict, user_id: str) -> dict:
    query = args.get("query", "").lower()
    date_from = args.get("date_from", "")
    date_to = args.get("date_to", "")
    category = args.get("category", "")

    conn = get_connection()
    sql = "SELECT * FROM transactions WHERE user_id=?"
    params: list = [user_id]
    if date_from:
        sql += " AND date>=?"
        params.append(date_from)
    if date_to:
        sql += " AND date<=?"
        params.append(date_to)
    if category:
        sql += " AND category=?"
        params.append(category)
    sql += " ORDER BY date DESC LIMIT 50"
    rows = conn.execute(sql, params).fetchall()
    conn.close()

    results = []
    for r in rows:
        merchant = (r["merchant"] or "").lower()
        desc = (r["description"] or "").lower()
        if query and query not in merchant and query not in desc:
            continue
        results.append({
            "id": r["id"], "date": r["date"],
            "merchant": r["merchant"], "category": r["category"],
            "amount": float(r["amount"]),
        })

    return {"query": query, "results": results, "count": len(results)}
def _get_expenses(args: dict, user_id: str) -> dict:
    """Retrieve logged expenses with optional filters."""
    date_range = args.get("date_range") or {}
    date_from = date_range.get("from")
    date_to = date_range.get("to")
    category = args.get("category")
    search = (args.get("search") or "").strip()
    try:
        limit = int(args.get("limit") or 50)
    except (TypeError, ValueError):
        limit = 50
    limit = max(1, min(limit, 500))

    sql = "SELECT * FROM transactions WHERE user_id=?"
    params: list = [user_id]
    if date_from:
        sql += " AND date >= ?"
        params.append(date_from)
    if date_to:
        sql += " AND date <= ?"
        params.append(date_to)
    if category:
        sql += " AND category=?"
        params.append(category)
    if search:
        sql += " AND (LOWER(merchant) LIKE ? OR LOWER(description) LIKE ?)"
        params.extend([f"%{search.lower()}%", f"%{search.lower()}%"])
    sql += " ORDER BY date DESC, id DESC LIMIT ?"
    params.append(limit)

    conn = get_connection()
    rows = conn.execute(sql, tuple(params)).fetchall()
    conn.close()
    expenses = [dict(r) if not isinstance(r, dict) else r for r in rows]
    total = sum(float(e.get("amount") or 0) for e in expenses)
    return {
        "status": "ok",
        "count": len(expenses),
        "total": round(total, 2),
        "expenses": expenses,
    }
