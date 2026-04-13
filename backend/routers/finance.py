"""
backend/routers/finance.py — Financial data endpoints.

Covers the dashboard overview, transaction CRUD, budgets, recurring bills,
income tracking, net-worth snapshots, and spending forecasts. These endpoints
power the Dashboard, Budget, and Forecast tabs in the Next.js frontend.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.auth import get_current_user
from backend.schemas import BillReq, BudgetReq, TransactionReq
from db import (
    adjust_balance,
    fetch_rows,
    get_balance,
    get_connection,
    insert_row,
    update_row,
)

router = APIRouter(tags=["finance"])


# ── Dashboard ─────────────────────────────────────────────────────────────────

@router.get("/api/dashboard/stats")
async def dashboard_stats(user: dict = Depends(get_current_user)):
    """Aggregated snapshot for the main dashboard: balance, spending, events, goals, tasks."""
    uid = user["user_id"]
    today = date.today()
    month_start = today.replace(day=1).isoformat()

    conn = get_connection()

    balance = get_balance(uid)

    month_row = conn.execute(
        "SELECT COALESCE(SUM(amount),0) as total FROM transactions "
        "WHERE user_id=? AND date>=? AND amount>0", (uid, month_start),
    ).fetchone()
    month_spend = float(month_row["total"]) if month_row else 0.0

    cats = conn.execute(
        "SELECT category, SUM(amount) as total FROM transactions "
        "WHERE user_id=? AND date>=? AND amount>0 "
        "GROUP BY category ORDER BY total DESC LIMIT 5",
        (uid, month_start),
    ).fetchall()

    recent_txns = conn.execute(
        "SELECT id, merchant, amount, date, category FROM transactions "
        "WHERE user_id=? ORDER BY date DESC, rowid DESC LIMIT 10",
        (uid,),
    ).fetchall()

    next_events = conn.execute(
        "SELECT id, title, event_date, event_type FROM events "
        "WHERE user_id=? AND event_date>=? ORDER BY event_date LIMIT 5",
        (uid, today.isoformat()),
    ).fetchall()

    goals = conn.execute(
        "SELECT id, name, target_amount, current_amount, target_date, category, is_completed "
        "FROM goals WHERE user_id=? AND is_completed=0 ORDER BY created_at DESC LIMIT 5",
        (uid,),
    ).fetchall()

    tasks = conn.execute(
        "SELECT id, title, priority, status, due_date FROM action_items "
        "WHERE user_id=? AND status='open' ORDER BY priority DESC, due_date ASC LIMIT 5",
        (uid,),
    ).fetchall()

    conn.close()

    return {
        "balance": balance,
        "month_spend": month_spend,
        "top_categories": [{"category": c["category"], "total": float(c["total"])} for c in cats],
        "recent_transactions": [dict(t) for t in recent_txns],
        "upcoming_events": [dict(e) for e in next_events],
        "active_goals": [dict(g) for g in goals],
        "open_tasks": [dict(t) for t in tasks],
    }


# ── Transactions ──────────────────────────────────────────────────────────────

@router.get("/api/transactions")
async def list_transactions(
    limit: int = Query(50, le=500),
    offset: int = Query(0),
    category: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    search: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    uid = user["user_id"]
    conn = get_connection()
    query = "SELECT * FROM transactions WHERE user_id=?"
    params: list = [uid]
    if category:
        query += " AND category=?"
        params.append(category)
    if date_from:
        query += " AND date>=?"
        params.append(date_from)
    if date_to:
        query += " AND date<=?"
        params.append(date_to)
    if search:
        query += " AND (LOWER(merchant) LIKE ? OR LOWER(category) LIKE ?)"
        params.extend([f"%{search.lower()}%", f"%{search.lower()}%"])
    query += " ORDER BY date DESC, rowid DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.post("/api/transactions")
async def create_transaction(body: TransactionReq, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    txn_id = str(uuid.uuid4())
    txn_date = body.date or datetime.now().strftime("%Y-%m-%d")
    insert_row("transactions", {
        "id": txn_id, "user_id": uid, "date": txn_date,
        "amount": body.amount, "merchant": body.merchant,
        "description": body.notes or body.merchant, "category": body.category,
        "is_recurring": 0, "metadata": "",
    })
    adjust_balance(uid, -body.amount)
    return {"id": txn_id, "balance": get_balance(uid)}


@router.delete("/api/transactions/{txn_id}")
async def delete_transaction(txn_id: str, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    conn = get_connection()
    row = conn.execute("SELECT amount FROM transactions WHERE id=? AND user_id=?", (txn_id, uid)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "Transaction not found")
    from db import delete_row
    delete_row("transactions", {"id": txn_id})
    adjust_balance(uid, float(row["amount"]))
    return {"deleted": True, "balance": get_balance(uid)}


# ── Budget ────────────────────────────────────────────────────────────────────

@router.get("/api/budget")
async def get_budget(
    month: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    uid = user["user_id"]
    target_month = month or datetime.now().strftime("%Y-%m")
    conn = get_connection()

    budgets = conn.execute(
        "SELECT * FROM budget_categories WHERE user_id=? AND month=?",
        (uid, target_month),
    ).fetchall()

    spent_rows = conn.execute(
        "SELECT category, SUM(amount) as total FROM transactions "
        "WHERE user_id=? AND date LIKE ? AND amount>0 GROUP BY category",
        (uid, f"{target_month}%"),
    ).fetchall()
    conn.close()

    spent_map = {r["category"]: float(r["total"]) for r in spent_rows}
    result = []
    for b in budgets:
        cat = b["category"]
        planned = float(b["planned"])
        spent = spent_map.get(cat, 0)
        result.append({
            "id": b["id"], "category": cat, "planned": planned,
            "spent": spent, "remaining": planned - spent,
            "pct_used": round(spent / planned * 100, 1) if planned > 0 else 0,
        })
    return {"month": target_month, "categories": result}


@router.post("/api/budget")
async def set_budget(body: BudgetReq, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    target_month = body.month or datetime.now().strftime("%Y-%m")
    conn = get_connection()
    existing = conn.execute(
        "SELECT id FROM budget_categories WHERE user_id=? AND category=? AND month=?",
        (uid, body.category, target_month),
    ).fetchone()
    conn.close()
    if existing:
        update_row("budget_categories", {"planned": body.planned}, {"id": existing["id"]})
        return {"id": existing["id"], "updated": True}
    budget_id = str(uuid.uuid4())
    insert_row("budget_categories", {
        "id": budget_id, "user_id": uid, "category": body.category,
        "planned": body.planned, "month": target_month,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"id": budget_id, "created": True}


@router.delete("/api/budget/{cat_id}")
async def delete_budget_category(cat_id: str, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    conn = get_connection()
    row = conn.execute(
        "SELECT id FROM budget_categories WHERE id=? AND user_id=?", (cat_id, uid)
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "Budget category not found")
    from db import delete_row
    delete_row("budget_categories", {"id": cat_id})
    return {"deleted": True}


# ── Bills / Subscriptions ────────────────────────────────────────────────────

@router.get("/api/bills")
async def list_bills(user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM subscriptions WHERE user_id=? ORDER BY next_due ASC",
        (uid,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.post("/api/bills")
async def create_bill(body: BillReq, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    bill_id = str(uuid.uuid4())
    next_due = body.next_due or datetime.now().strftime("%Y-%m-%d")
    insert_row("subscriptions", {
        "id": bill_id, "user_id": uid, "name": body.name,
        "amount": body.amount, "frequency": body.frequency,
        "next_due": next_due, "category": body.category,
        "is_active": 1, "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"id": bill_id}


@router.delete("/api/bills/{bill_id}")
async def delete_bill(bill_id: str, user: dict = Depends(get_current_user)):
    from db import delete_row
    delete_row("subscriptions", {"id": bill_id})
    return {"deleted": True}


# ── Recurring Income ──────────────────────────────────────────────────────────

@router.get("/api/income")
async def list_income(user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM recurring_income WHERE user_id=? AND is_active=1 ORDER BY amount DESC",
        (uid,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ── Net Worth ─────────────────────────────────────────────────────────────────

@router.get("/api/net-worth")
async def get_net_worth(user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    conn = get_connection()
    assets = conn.execute(
        "SELECT SUM(balance) as total FROM accounts WHERE user_id=? AND balance>0", (uid,)
    ).fetchone()
    liabs = conn.execute(
        "SELECT ABS(SUM(balance)) as total FROM accounts WHERE user_id=? AND balance<0", (uid,)
    ).fetchone()
    snapshots = conn.execute(
        "SELECT net_worth, snapshot_date FROM net_worth_snapshots "
        "WHERE user_id=? ORDER BY snapshot_date DESC LIMIT 90", (uid,)
    ).fetchall()
    conn.close()

    total_assets = float(assets["total"] or 0) if assets else 0
    total_liabs = float(liabs["total"] or 0) if liabs else 0
    return {
        "total_assets": total_assets,
        "total_liabilities": total_liabs,
        "net_worth": total_assets - total_liabs,
        "history": [dict(s) for s in reversed(snapshots)],
    }


# ── Forecast ──────────────────────────────────────────────────────────────────

@router.get("/api/forecast")
async def get_forecast(user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    today = date.today()
    month_start = today.replace(day=1).isoformat()
    from db import get_total_monthly_income

    conn = get_connection()
    income = get_total_monthly_income(uid)
    balance = get_balance(uid)

    spent_row = conn.execute(
        "SELECT COALESCE(SUM(amount),0) as total FROM transactions "
        "WHERE user_id=? AND date>=? AND amount>0", (uid, month_start),
    ).fetchone()
    month_spent = float(spent_row["total"]) if spent_row else 0

    bills = conn.execute(
        "SELECT name, amount, next_due, frequency FROM subscriptions "
        "WHERE user_id=? AND is_active=1 ORDER BY next_due ASC", (uid,),
    ).fetchall()
    total_bills = sum(float(b["amount"]) for b in bills)

    goals = conn.execute(
        "SELECT name, target_amount, current_amount, target_date FROM goals "
        "WHERE user_id=? AND is_completed=0", (uid,),
    ).fetchall()
    total_goal_remaining = sum(max(0, float(g["target_amount"]) - float(g["current_amount"])) for g in goals)
    conn.close()

    projected_remaining = balance + income - total_bills
    free_after_goals = projected_remaining - total_goal_remaining

    return {
        "income": income,
        "balance": balance,
        "month_spent": month_spent,
        "total_monthly_bills": total_bills,
        "bills": [dict(b) for b in bills],
        "total_goal_remaining": total_goal_remaining,
        "goals_summary": [dict(g) for g in goals],
        "projected_remaining": projected_remaining,
        "free_after_goals": max(0, free_after_goals),
    }
