"""
backend/main.py — FastAPI backend for orryon.

Wraps existing Python modules (db, core/, email_sender) in a REST + SSE API.
Run from project root:  uvicorn backend.main:app --reload --port 8000
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import secrets
import shutil
import tempfile
import uuid
import zipfile
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import Depends, FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel

from backend.auth import create_token, get_current_user
from config import APP_URL, ATTACHMENTS_DIR, DB_PATH, SMTP_ENABLED, XAI_API_KEY
from core.scheduler import start_scheduler, stop_scheduler
from db import (
    adjust_balance,
    create_verification_code,
    fetch_rows,
    get_balance,
    get_connection,
    get_monthly_spend,
    get_or_create_user_by_email,
    insert_row,
    load_chat_history,
    record_token_spend,
    save_chat_message,
    update_row,
    verify_code,
)
from email_sender import send_verification_code

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(name)s  %(levelname)s  %(message)s")
logger = logging.getLogger(__name__)

_IS_PRODUCTION = os.getenv("NODE_ENV", "").lower() == "production"


# ---------------------------------------------------------------------------
# Rate limiter (in-memory, per-user)
# ---------------------------------------------------------------------------

import time as _time
from collections import defaultdict as _defaultdict

_rate_buckets: dict[str, list[float]] = _defaultdict(list)
_RATE_WINDOW = 60
_RATE_LIMIT_CHAT = 20
_RATE_LIMIT_DEFAULT = 120

MONTHLY_SPEND_CAP_USD = 1.80


def _check_rate_limit(user_id: str, limit: int = _RATE_LIMIT_DEFAULT) -> None:
    now = _time.time()
    bucket = _rate_buckets[user_id]
    _rate_buckets[user_id] = [t for t in bucket if now - t < _RATE_WINDOW]
    if len(_rate_buckets[user_id]) >= limit:
        raise HTTPException(429, "Too many requests. Please wait a moment.")
    _rate_buckets[user_id].append(now)


# ---------------------------------------------------------------------------
# Subscription enforcement dependency
# ---------------------------------------------------------------------------

def _resolve_plan_for_user(user_id: str) -> dict:
    conn = get_connection()
    row = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "User not found")
    return _resolve_plan(dict(row))


async def require_active_plan(user: dict = Depends(get_current_user)) -> dict:
    """FastAPI dependency — blocks requests if subscription is inactive."""
    info = _resolve_plan_for_user(user["user_id"])
    if not info["is_active_pro"]:
        raise HTTPException(
            403,
            "Your Pro trial has ended. Upgrade to continue using this feature.",
        )
    return user

# ---------------------------------------------------------------------------
# Lifespan — start/stop scheduler
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(title="orryon", version="2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", os.getenv("FRONTEND_URL", "")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ===========================================================================
# Pydantic models
# ===========================================================================

class SendCodeReq(BaseModel):
    email: str

class VerifyReq(BaseModel):
    email: str
    code: str
    display_name: Optional[str] = None

class SignupCheckoutReq(BaseModel):
    price_id: str
    success_url: str
    cancel_url: str

class AuthRes(BaseModel):
    token: str
    user: dict

class TransactionReq(BaseModel):
    amount: float
    merchant: str
    category: str
    date: Optional[str] = None
    notes: Optional[str] = ""

class EventReq(BaseModel):
    title: str
    date: str
    time: Optional[str] = ""
    description: Optional[str] = ""
    event_type: Optional[str] = "event"
    reminder_minutes: Optional[int] = 30

class GoalReq(BaseModel):
    name: str
    target_amount: float
    target_date: Optional[str] = ""
    category: Optional[str] = "other"
    notes: Optional[str] = ""

class GoalUpdate(BaseModel):
    current_amount: Optional[float] = None
    target_amount: Optional[float] = None
    name: Optional[str] = None
    notes: Optional[str] = None
    is_completed: Optional[int] = None

class NoteReq(BaseModel):
    title: str
    content: Optional[str] = ""
    tags: Optional[str] = ""
    mood: Optional[str] = ""
    linked_goal: Optional[str] = ""

class NoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    tags: Optional[str] = None
    mood: Optional[str] = None
    is_pinned: Optional[int] = None

class TaskReq(BaseModel):
    title: str
    due_date: Optional[str] = ""
    priority: Optional[str] = "medium"
    category: Optional[str] = "personal"

class TaskUpdate(BaseModel):
    status: Optional[str] = None
    title: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[str] = None

class GroceryItemReq(BaseModel):
    name: str
    quantity: Optional[str] = "1"

class BudgetReq(BaseModel):
    category: str
    planned: float
    month: Optional[str] = None

class SettingsUpdate(BaseModel):
    display_name: Optional[str] = None
    default_reminder_minutes: Optional[int] = None
    daily_digest_enabled: Optional[int] = None
    daily_digest_time: Optional[str] = None
    weekly_report_enabled: Optional[int] = None
    bill_due_alert_days: Optional[int] = None
    currency: Optional[str] = None
    budget_cycle_start: Optional[int] = None
    spending_alert_pct: Optional[int] = None

class EmailChangeSendReq(BaseModel):
    new_email: str

class EmailChangeVerifyReq(BaseModel):
    new_email: str
    code: str

class ChatReq(BaseModel):
    message: str


# ===========================================================================
# AUTH
# ===========================================================================

@app.post("/api/auth/send-code")
async def auth_send_code(body: SendCodeReq):
    email = body.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(400, "Invalid email address")
    code = create_verification_code(email)
    sent = send_verification_code(email, code)
    return {
        "sent": sent,
        "dev_code": "" if (sent or _IS_PRODUCTION) else code,
        "message": "Code sent" if sent else "SMTP not configured — code returned for dev mode",
    }


@app.post("/api/auth/verify", response_model=AuthRes)
async def auth_verify(body: VerifyReq):
    email = body.email.strip().lower()
    if not verify_code(email, body.code.strip()):
        raise HTTPException(401, "Invalid or expired code")
    display_name = (body.display_name or "").strip()
    user = get_or_create_user_by_email(email, display_name=display_name)
    if display_name and user.get("display_name") != display_name:
        update_row("users", {"display_name": display_name}, {"id": user["id"]})
        user["display_name"] = display_name
    existing_txns = fetch_rows("transactions", {"user_id": user["id"]})
    if not existing_txns:
        from core.tools import seed_sample_data
        seed_sample_data(user["id"])
    token = create_token(user["id"], email)
    return {"token": token, "user": user}


@app.post("/api/auth/signup-checkout")
async def signup_checkout(body: SignupCheckoutReq, user: dict = Depends(get_current_user)):
    """Create a Stripe Checkout session with a 14-day trial as part of signup."""
    from config import STRIPE_ENABLED, STRIPE_SECRET_KEY, TRIAL_DAYS
    if not STRIPE_ENABLED:
        raise HTTPException(503, "Stripe is not configured. Set STRIPE_SECRET_KEY in .env")
    try:
        import stripe as stripe_lib
        stripe_lib.api_key = STRIPE_SECRET_KEY
    except ImportError:
        raise HTTPException(503, "stripe package not installed")

    conn = get_connection()
    row = conn.execute("SELECT * FROM users WHERE id=?", (user["user_id"],)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "User not found")
    row = dict(row)

    if row.get("stripe_subscription_id"):
        raise HTTPException(400, "You already have an active subscription")

    customer_id = row.get("stripe_customer_id") or ""
    if not customer_id:
        customer = stripe_lib.Customer.create(
            email=row["email"],
            name=row.get("display_name") or "",
            metadata={"user_id": row["id"]},
        )
        customer_id = customer.id
        conn = get_connection()
        conn.execute("UPDATE users SET stripe_customer_id=? WHERE id=?", (customer_id, row["id"]))
        conn.commit()
        conn.close()

    session = stripe_lib.checkout.Session.create(
        customer=customer_id,
        payment_method_types=["card"],
        line_items=[{"price": body.price_id, "quantity": 1}],
        mode="subscription",
        subscription_data={"trial_period_days": TRIAL_DAYS},
        success_url=body.success_url,
        cancel_url=body.cancel_url,
        metadata={"user_id": row["id"]},
    )
    return {"checkout_url": session.url}


@app.post("/api/auth/demo", response_model=AuthRes)
async def auth_demo():
    if _IS_PRODUCTION:
        raise HTTPException(403, "Demo mode is disabled in production")
    email = "demo@orryon.app"
    user = get_or_create_user_by_email(email)
    existing_txns = fetch_rows("transactions", {"user_id": user["id"]})
    if not existing_txns:
        from core.tools import seed_sample_data
        seed_sample_data(user["id"])
    token = create_token(user["id"], email)
    return {"token": token, "user": user}


@app.get("/api/auth/me")
async def auth_me(user: dict = Depends(get_current_user)):
    conn = get_connection()
    row = conn.execute("SELECT * FROM users WHERE id=?", (user["user_id"],)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "User not found")
    return dict(row)


# ===========================================================================
# DASHBOARD
# ===========================================================================

@app.get("/api/dashboard/stats")
async def dashboard_stats(user: dict = Depends(get_current_user)):
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


# ===========================================================================
# TRANSACTIONS
# ===========================================================================

@app.get("/api/transactions")
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


@app.post("/api/transactions")
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


@app.delete("/api/transactions/{txn_id}")
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


# ===========================================================================
# EVENTS
# ===========================================================================

@app.get("/api/events")
async def list_events(
    upcoming: bool = Query(False),
    limit: int = Query(50, le=200),
    user: dict = Depends(get_current_user),
):
    uid = user["user_id"]
    conn = get_connection()
    if upcoming:
        rows = conn.execute(
            "SELECT * FROM events WHERE user_id=? AND event_date>=? ORDER BY event_date LIMIT ?",
            (uid, date.today().isoformat(), limit),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM events WHERE user_id=? ORDER BY event_date DESC LIMIT ?",
            (uid, limit),
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/api/events")
async def create_event(body: EventReq, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    evt_id = str(uuid.uuid4())
    event_date = body.date
    if body.time:
        event_date = f"{body.date} {body.time}"
    insert_row("events", {
        "id": evt_id, "user_id": uid, "title": body.title,
        "description": body.description, "event_date": event_date,
        "event_type": body.event_type, "amount": 0, "is_recurring": 0,
        "recurrence": "", "is_synced_to_google": 0,
        "reminder_minutes": body.reminder_minutes, "reminder_sent": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"id": evt_id}


@app.delete("/api/events/{event_id}")
async def delete_event(event_id: str, user: dict = Depends(get_current_user)):
    from db import delete_row
    delete_row("events", {"id": event_id})
    return {"deleted": True}


# ===========================================================================
# GOALS
# ===========================================================================

@app.get("/api/goals")
async def list_goals(
    include_completed: bool = Query(False),
    user: dict = Depends(get_current_user),
):
    uid = user["user_id"]
    conn = get_connection()
    if include_completed:
        rows = conn.execute(
            "SELECT * FROM goals WHERE user_id=? ORDER BY is_completed ASC, created_at DESC", (uid,)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM goals WHERE user_id=? AND is_completed=0 ORDER BY created_at DESC", (uid,)
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/api/goals")
async def create_goal(body: GoalReq, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    goal_id = str(uuid.uuid4())
    insert_row("goals", {
        "id": goal_id, "user_id": uid, "name": body.name,
        "target_amount": body.target_amount, "current_amount": 0,
        "target_date": body.target_date, "category": body.category,
        "linked_budget_category": "", "notes": body.notes,
        "created_at": datetime.now(timezone.utc).isoformat(), "is_completed": 0,
    })
    return {"id": goal_id}


@app.patch("/api/goals/{goal_id}")
async def update_goal(goal_id: str, body: GoalUpdate, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")

    # Auto-log a contribution when current_amount changes
    if "current_amount" in updates:
        conn = get_connection()
        old = conn.execute(
            "SELECT current_amount FROM goals WHERE id=? AND user_id=?", (goal_id, uid)
        ).fetchone()
        conn.close()
        if old:
            delta = float(updates["current_amount"]) - float(old["current_amount"])
            if delta != 0:
                insert_row("goal_contributions", {
                    "id": str(uuid.uuid4()),
                    "goal_id": goal_id,
                    "user_id": uid,
                    "amount": delta,
                    "note": "",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })

    update_row("goals", updates, {"id": goal_id})
    return {"updated": True}


@app.get("/api/goals/{goal_id}/contributions")
async def get_goal_contributions(goal_id: str, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM goal_contributions WHERE goal_id=? AND user_id=? ORDER BY created_at DESC",
        (goal_id, uid),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/api/goals/{goal_id}/contributions")
async def add_goal_contribution(goal_id: str, body: dict, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    amount = float(body.get("amount", 0))
    if amount == 0:
        raise HTTPException(400, "Amount required")
    conn = get_connection()
    goal = conn.execute(
        "SELECT current_amount FROM goals WHERE id=? AND user_id=?", (goal_id, uid)
    ).fetchone()
    conn.close()
    if not goal:
        raise HTTPException(404, "Goal not found")
    new_amount = float(goal["current_amount"]) + amount
    update_row("goals", {"current_amount": new_amount}, {"id": goal_id})
    insert_row("goal_contributions", {
        "id": str(uuid.uuid4()),
        "goal_id": goal_id,
        "user_id": uid,
        "amount": amount,
        "note": body.get("note", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"current_amount": new_amount}


# ===========================================================================
# NOTES
# ===========================================================================

@app.get("/api/notes")
async def list_notes(
    search: Optional[str] = None,
    mood: Optional[str] = None,
    tag: Optional[str] = None,
    limit: int = Query(50, le=200),
    user: dict = Depends(get_current_user),
):
    uid = user["user_id"]
    conn = get_connection()
    query = "SELECT * FROM notes WHERE user_id=?"
    params: list = [uid]
    if search:
        query += " AND (LOWER(title) LIKE ? OR LOWER(content) LIKE ?)"
        params.extend([f"%{search.lower()}%", f"%{search.lower()}%"])
    if mood:
        query += " AND mood=?"
        params.append(mood)
    if tag:
        query += " AND LOWER(tags) LIKE ?"
        params.append(f"%{tag.lower()}%")
    query += " ORDER BY is_pinned DESC, updated_at DESC LIMIT ?"
    params.append(limit)
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/api/notes")
async def create_note(body: NoteReq, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    note_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    insert_row("notes", {
        "id": note_id, "user_id": uid, "title": body.title,
        "content": body.content, "tags": body.tags,
        "linked_account": "", "linked_goal": body.linked_goal,
        "created_at": now, "updated_at": now,
        "is_pinned": 0, "mood": body.mood,
    })
    return {"id": note_id}


@app.patch("/api/notes/{note_id}")
async def update_note(note_id: str, body: NoteUpdate, user: dict = Depends(get_current_user)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_row("notes", updates, {"id": note_id})
    return {"updated": True}


@app.delete("/api/notes/{note_id}")
async def delete_note(note_id: str, user: dict = Depends(get_current_user)):
    from db import delete_row
    delete_row("notes", {"id": note_id})
    return {"deleted": True}


# ===========================================================================
# TASKS
# ===========================================================================

@app.get("/api/tasks")
async def list_tasks(
    status: Optional[str] = None,
    limit: int = Query(50, le=200),
    user: dict = Depends(get_current_user),
):
    uid = user["user_id"]
    conn = get_connection()
    query = "SELECT * FROM action_items WHERE user_id=?"
    params: list = [uid]
    if status:
        query += " AND status=?"
        params.append(status)
    query += " ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, due_date ASC LIMIT ?"
    params.append(limit)
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/api/tasks")
async def create_task(body: TaskReq, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    task_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    insert_row("action_items", {
        "id": task_id, "user_id": uid, "title": body.title,
        "description": "", "priority": body.priority, "status": "open",
        "due_date": body.due_date, "category": body.category,
        "created_by": "user", "created_at": now, "updated_at": now,
    })
    return {"id": task_id}


@app.patch("/api/tasks/{task_id}")
async def update_task(task_id: str, body: TaskUpdate, user: dict = Depends(get_current_user)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_row("action_items", updates, {"id": task_id})
    return {"updated": True}


@app.delete("/api/tasks/{task_id}")
async def delete_task(task_id: str, user: dict = Depends(get_current_user)):
    from db import delete_row
    delete_row("action_items", {"id": task_id})
    return {"deleted": True}


# ===========================================================================
# GROCERY
# ===========================================================================

@app.get("/api/grocery")
async def list_grocery(user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM grocery_items WHERE user_id=? ORDER BY is_checked ASC, added_at DESC",
        (uid,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/api/grocery")
async def add_grocery_item(body: GroceryItemReq, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    item_id = str(uuid.uuid4())
    insert_row("grocery_items", {
        "id": item_id, "user_id": uid, "name": body.name,
        "quantity": body.quantity, "estimated_price": 0,
        "is_checked": 0, "added_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"id": item_id}


@app.patch("/api/grocery/{item_id}")
async def toggle_grocery(item_id: str, user: dict = Depends(get_current_user)):
    conn = get_connection()
    row = conn.execute("SELECT is_checked FROM grocery_items WHERE id=?", (item_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "Item not found")
    new_val = 0 if row["is_checked"] else 1
    update_row("grocery_items", {"is_checked": new_val}, {"id": item_id})
    return {"is_checked": new_val}


@app.delete("/api/grocery/{item_id}")
async def delete_grocery(item_id: str, user: dict = Depends(get_current_user)):
    from db import delete_row
    delete_row("grocery_items", {"id": item_id})
    return {"deleted": True}


# ===========================================================================
# BUDGET
# ===========================================================================

@app.get("/api/budget")
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


@app.post("/api/budget")
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


@app.delete("/api/budget/{cat_id}")
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


# ===========================================================================
# SUBSCRIPTIONS / BILLS
# ===========================================================================

@app.get("/api/bills")
async def list_bills(user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM subscriptions WHERE user_id=? ORDER BY next_due ASC",
        (uid,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


class BillReq(BaseModel):
    name: str
    amount: float
    frequency: Optional[str] = "monthly"
    next_due: Optional[str] = None
    category: Optional[str] = "Subscriptions"


@app.post("/api/bills")
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


@app.delete("/api/bills/{bill_id}")
async def delete_bill(bill_id: str, user: dict = Depends(get_current_user)):
    from db import delete_row
    delete_row("subscriptions", {"id": bill_id})
    return {"deleted": True}


# ===========================================================================
# CHAT (SSE streaming)
# ===========================================================================

@app.post("/api/chat")
async def chat_stream(body: ChatReq, user: dict = Depends(require_active_plan)):
    uid = user["user_id"]
    _check_rate_limit(uid, _RATE_LIMIT_CHAT)
    message = body.message.strip()
    if not message:
        raise HTTPException(400, "Empty message")

    conn = get_connection()
    user_row = conn.execute("SELECT display_name FROM users WHERE id=?", (uid,)).fetchone()
    conn.close()
    display_name = user_row["display_name"] if user_row else "there"

    history = load_chat_history(uid)
    user_msg = {"role": "user", "content": message, "created_at": datetime.now(timezone.utc).isoformat()}
    save_chat_message(uid, user_msg)

    async def event_generator():
        # Block before hitting the API if this user has already exceeded the monthly cap
        current_spend = get_monthly_spend(uid)
        if current_spend >= MONTHLY_SPEND_CAP_USD:
            yield f"data: {json.dumps({'type': 'error', 'message': 'You have reached your monthly usage limit. It resets on the 1st of next month.'})}\n\n"
            yield "data: [DONE]\n\n"
            return

        from core.grok_agent import run_orryon_stream
        full_text = ""
        try:
            for event in run_orryon_stream(
                user_message=message,
                user_id=uid,
                chat_history=history,
                user_name=display_name or "there",
            ):
                if event["type"] == "token":
                    full_text += event["content"]
                    yield f"data: {json.dumps(event)}\n\n"
                elif event["type"] == "tool":
                    yield f"data: {json.dumps(event)}\n\n"
                elif event["type"] == "done":
                    final_text = event.get("message", full_text)
                    ai_msg = {"role": "assistant", "content": final_text, "created_at": datetime.now(timezone.utc).isoformat()}
                    save_chat_message(uid, ai_msg)
                    # Record actual token spend so the monthly cap is enforced precisely
                    usage = event.get("usage") or {}
                    if usage.get("prompt_tokens") or usage.get("completion_tokens"):
                        record_token_spend(
                            uid,
                            usage.get("prompt_tokens", 0),
                            usage.get("completion_tokens", 0),
                        )
                    yield f"data: {json.dumps(event)}\n\n"
                elif event["type"] == "error":
                    yield f"data: {json.dumps(event)}\n\n"
        except Exception as exc:
            logger.error("Chat stream error: %s", exc)
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.get("/api/chat/history")
async def chat_history(limit: int = Query(100, le=500), user: dict = Depends(get_current_user)):
    return load_chat_history(user["user_id"], limit=limit)


# ===========================================================================
# SETTINGS
# ===========================================================================

@app.get("/api/settings")
async def get_settings(user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    conn = get_connection()
    row = conn.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "User not found")
    d = dict(row)
    d["smtp_enabled"] = SMTP_ENABLED
    d["ai_connected"] = bool(XAI_API_KEY)
    d["grok_model"] = os.getenv("GROK_MODEL", "grok-3-mini")
    return d


@app.patch("/api/settings")
async def update_settings(body: SettingsUpdate, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")
    update_row("users", updates, {"id": uid})
    return {"updated": True}


@app.post("/api/settings/email-change/send-code")
async def email_change_send_code(body: EmailChangeSendReq, user: dict = Depends(get_current_user)):
    new_email = body.new_email.strip().lower()
    if not new_email or "@" not in new_email:
        raise HTTPException(400, "Invalid email address")
    conn = get_connection()
    existing = conn.execute(
        "SELECT id FROM users WHERE email=? AND id!=?", (new_email, user["user_id"])
    ).fetchone()
    conn.close()
    if existing:
        raise HTTPException(400, "That email is already associated with another account")
    code = create_verification_code(new_email)
    sent = send_verification_code(new_email, code)
    return {
        "sent": sent,
        "dev_code": "" if (sent or _IS_PRODUCTION) else code,
        "message": "Code sent" if sent else "SMTP not configured — code returned for dev mode",
    }


@app.post("/api/settings/email-change/verify")
async def email_change_verify(body: EmailChangeVerifyReq, user: dict = Depends(get_current_user)):
    new_email = body.new_email.strip().lower()
    if not verify_code(new_email, body.code.strip()):
        raise HTTPException(401, "Invalid or expired code")
    uid = user["user_id"]
    conn = get_connection()
    existing = conn.execute(
        "SELECT id FROM users WHERE email=? AND id!=?", (new_email, uid)
    ).fetchone()
    conn.close()
    if existing:
        raise HTTPException(400, "That email is already in use")
    update_row("users", {"email": new_email}, {"id": uid})
    token = create_token(uid, new_email)
    return {"token": token, "email": new_email}


@app.delete("/api/account")
async def delete_account(user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    conn = get_connection()
    user_data_tables = [
        "transactions", "accounts", "holdings", "goals", "notes", "events",
        "subscriptions", "credit_scores", "action_items", "links", "inspo_images",
        "budget_categories", "grocery_items", "custom_categories", "share_tokens",
        "user_memory", "recurring_income", "net_worth_snapshots", "link_pages",
        "chat_messages",
    ]
    for table in user_data_tables:
        try:
            conn.execute(f"DELETE FROM {table} WHERE user_id=?", (uid,))
        except Exception:
            pass
    conn.execute("DELETE FROM users WHERE id=?", (uid,))
    conn.commit()
    conn.close()
    return {"deleted": True}


# ===========================================================================
# EXPORT
# ===========================================================================

@app.get("/api/export")
async def export_data(user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    with tempfile.TemporaryDirectory() as tmpdir:
        db_copy = os.path.join(tmpdir, "finance.db")
        shutil.copy2(DB_PATH, db_copy)

        conn = get_connection()
        tables = [r["name"] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()]
        export_data = {}
        for tbl in tables:
            cols = [r[1] for r in conn.execute(f"PRAGMA table_info({tbl})").fetchall()]
            if "user_id" in cols:
                rows = conn.execute(f"SELECT * FROM {tbl} WHERE user_id=?", (uid,)).fetchall()
            elif tbl == "users":
                rows = conn.execute(f"SELECT * FROM {tbl} WHERE id=?", (uid,)).fetchall()
            else:
                continue
            export_data[tbl] = [dict(r) for r in rows]
        conn.close()

        json_path = os.path.join(tmpdir, "data.json")
        with open(json_path, "w") as jf:
            json.dump(export_data, jf, indent=2, default=str)

        zip_path = os.path.join(tmpdir, "orryon_export.zip")
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.write(db_copy, "finance.db")
            zf.write(json_path, "data.json")

        with open(zip_path, "rb") as zr:
            zip_bytes = zr.read()

    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=orryon_export.zip"},
    )


# ===========================================================================
# SHARE
# ===========================================================================

@app.post("/api/share")
async def create_share_link(user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    conn = get_connection()
    existing = conn.execute(
        "SELECT token FROM share_tokens WHERE user_id=? AND is_active=1 AND view_type='finance_readonly'",
        (uid,),
    ).fetchone()
    conn.close()
    if existing:
        return {"token": existing["token"], "url": f"{APP_URL}?share_token={existing['token']}"}
    token = secrets.token_urlsafe(16)
    insert_row("share_tokens", {
        "id": str(uuid.uuid4()), "user_id": uid, "token": token,
        "view_type": "finance_readonly", "is_active": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"token": token, "url": f"{APP_URL}?share_token={token}"}


@app.get("/api/share/{token}")
async def get_shared_dashboard(token: str):
    """Public endpoint — no auth required."""
    conn = get_connection()
    tok_row = conn.execute(
        "SELECT user_id FROM share_tokens WHERE token=? AND is_active=1 AND view_type='finance_readonly'",
        (token,),
    ).fetchone()
    if not tok_row:
        conn.close()
        raise HTTPException(404, "Invalid or expired share link")
    uid = tok_row["user_id"]
    today = date.today()
    month_start = today.replace(day=1).isoformat()

    balance = get_balance(uid)
    month_row = conn.execute(
        "SELECT COALESCE(SUM(amount),0) as total FROM transactions "
        "WHERE user_id=? AND date>=? AND amount>0", (uid, month_start),
    ).fetchone()
    cats = conn.execute(
        "SELECT category, SUM(amount) as total FROM transactions "
        "WHERE user_id=? AND date>=? AND amount>0 GROUP BY category ORDER BY total DESC LIMIT 5",
        (uid, month_start),
    ).fetchall()
    conn.close()

    return {
        "balance": balance,
        "month_spend": float(month_row["total"]) if month_row else 0,
        "top_categories": [{"category": c["category"], "total": float(c["total"])} for c in cats],
    }


# ===========================================================================
# NET WORTH / FORECAST helpers
# ===========================================================================

@app.get("/api/net-worth")
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


# ===========================================================================
# FORECAST
# ===========================================================================

@app.get("/api/forecast")
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


# ===========================================================================
# RECURRING INCOME
# ===========================================================================

@app.get("/api/income")
async def list_income(user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM recurring_income WHERE user_id=? AND is_active=1 ORDER BY amount DESC",
        (uid,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ===========================================================================
# RECEIPT SCANNING
# ===========================================================================

@app.post("/api/receipts/scan")
async def scan_receipt(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    import base64
    import re as re_module

    contents = await file.read()
    b64 = base64.b64encode(contents).decode("utf-8")
    mime = file.content_type or "image/jpeg"

    payload = {
        "model": "grok-2-vision-1212",
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{mime};base64,{b64}"},
                    },
                    {
                        "type": "text",
                        "text": (
                            "This is a receipt image. Extract the following and respond ONLY with valid JSON, no markdown:\n"
                            '{"merchant": "store name", "amount": 12.34, "date": "YYYY-MM-DD", "category": "one of: Food & Dining, Groceries, Transport, Entertainment, Shopping, Health & Fitness, Utilities, Travel, Subscriptions, Personal Care, Education, Other", "items": ["item1", "item2"]}\n'
                            "If you cannot determine a field, use null. Amount must be a number (total paid). Date must be YYYY-MM-DD format."
                        ),
                    },
                ],
            }
        ],
        "max_tokens": 300,
        "temperature": 0,
    }

    headers = {
        "Authorization": f"Bearer {XAI_API_KEY}",
        "Content-Type": "application/json",
    }

    import requests as req_lib
    resp = req_lib.post("https://api.x.ai/v1/chat/completions", headers=headers, json=payload, timeout=30)

    if not resp.ok:
        raise HTTPException(500, f"Vision API error: {resp.text}")

    raw = resp.json()["choices"][0]["message"]["content"].strip()

    # Strip markdown code fences if present
    raw = re_module.sub(r"^```[a-z]*\n?", "", raw)
    raw = re_module.sub(r"\n?```$", "", raw)

    try:
        result = json.loads(raw)
    except Exception:
        raise HTTPException(500, "Could not parse receipt data from image")

    return result


# ===========================================================================
# SUBSCRIPTION / BILLING
# ===========================================================================

def _resolve_plan(user_row: dict) -> dict:
    """Return the effective plan info for a user, expiring trials automatically."""
    plan = user_row.get("plan") or "free"
    trial_ends_at_str = user_row.get("trial_ends_at") or ""
    trial_days_remaining = 0

    if plan == "trial" and trial_ends_at_str:
        try:
            trial_ends = datetime.fromisoformat(trial_ends_at_str)
            if trial_ends.tzinfo is None:
                trial_ends = trial_ends.replace(tzinfo=timezone.utc)
            delta = trial_ends - datetime.now(timezone.utc)
            if delta.total_seconds() <= 0:
                # Trial has expired — downgrade to free
                plan = "free"
                conn = get_connection()
                conn.execute("UPDATE users SET plan='free' WHERE id=?", (user_row["id"],))
                conn.commit()
                conn.close()
            else:
                trial_days_remaining = max(0, delta.days)
        except Exception:
            pass

    return {
        "plan": plan,
        "trial_ends_at": trial_ends_at_str or None,
        "trial_days_remaining": trial_days_remaining,
        "is_active_pro": plan in ("trial", "pro"),
    }


@app.get("/api/subscription")
async def get_subscription(user: dict = Depends(get_current_user)):
    conn = get_connection()
    row = conn.execute("SELECT * FROM users WHERE id=?", (user["user_id"],)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "User not found")
    return _resolve_plan(dict(row))


class CheckoutReq(BaseModel):
    price_id: str
    success_url: str
    cancel_url: str


@app.post("/api/subscription/checkout")
async def create_checkout(body: CheckoutReq, user: dict = Depends(get_current_user)):
    from config import STRIPE_ENABLED, STRIPE_SECRET_KEY
    if not STRIPE_ENABLED:
        raise HTTPException(503, "Stripe is not configured. Set STRIPE_SECRET_KEY in .env")
    try:
        import stripe as stripe_lib
        stripe_lib.api_key = STRIPE_SECRET_KEY
    except ImportError:
        raise HTTPException(503, "stripe package not installed. Run: pip install stripe")

    conn = get_connection()
    row = conn.execute("SELECT * FROM users WHERE id=?", (user["user_id"],)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "User not found")
    row = dict(row)

    customer_id = row.get("stripe_customer_id") or ""
    if not customer_id:
        customer = stripe_lib.Customer.create(
            email=row["email"],
            metadata={"user_id": row["id"]},
        )
        customer_id = customer.id
        conn = get_connection()
        conn.execute("UPDATE users SET stripe_customer_id=? WHERE id=?", (customer_id, row["id"]))
        conn.commit()
        conn.close()

    from config import TRIAL_DAYS
    current_plan = _resolve_plan(row)
    checkout_params: dict[str, Any] = {
        "customer": customer_id,
        "payment_method_types": ["card"],
        "line_items": [{"price": body.price_id, "quantity": 1}],
        "mode": "subscription",
        "success_url": body.success_url,
        "cancel_url": body.cancel_url,
        "metadata": {"user_id": row["id"]},
    }
    if current_plan["plan"] in ("trial", "free") and not row.get("stripe_subscription_id"):
        checkout_params["subscription_data"] = {
            "trial_period_days": max(current_plan.get("trial_days_remaining", 0), 1)
            if current_plan["plan"] == "trial"
            else TRIAL_DAYS,
        }
    session = stripe_lib.checkout.Session.create(**checkout_params)
    return {"checkout_url": session.url}


@app.post("/api/subscription/portal")
async def billing_portal(user: dict = Depends(get_current_user)):
    from config import STRIPE_ENABLED, STRIPE_SECRET_KEY, APP_URL
    if not STRIPE_ENABLED:
        raise HTTPException(503, "Stripe is not configured")
    try:
        import stripe as stripe_lib
        stripe_lib.api_key = STRIPE_SECRET_KEY
    except ImportError:
        raise HTTPException(503, "stripe package not installed")

    conn = get_connection()
    row = conn.execute("SELECT stripe_customer_id FROM users WHERE id=?", (user["user_id"],)).fetchone()
    conn.close()
    if not row or not row["stripe_customer_id"]:
        raise HTTPException(400, "No billing account found. Please subscribe first.")

    frontend_url = os.getenv("FRONTEND_URL", APP_URL)
    portal = stripe_lib.billing_portal.Session.create(
        customer=row["stripe_customer_id"],
        return_url=f"{frontend_url}/home",
    )
    return {"portal_url": portal.url}


@app.post("/api/stripe/webhook")
async def stripe_webhook(request: Request):
    from config import STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
    try:
        import stripe as stripe_lib
        stripe_lib.api_key = STRIPE_SECRET_KEY
    except ImportError:
        raise HTTPException(503, "stripe package not installed")

    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        event = stripe_lib.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
    except stripe_lib.errors.SignatureVerificationError:
        raise HTTPException(400, "Invalid Stripe signature")

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        user_id = session.get("metadata", {}).get("user_id")
        sub_id = session.get("subscription")
        if user_id and sub_id:
            conn = get_connection()
            conn.execute(
                "UPDATE users SET plan='pro', stripe_subscription_id=?, trial_ends_at='' WHERE id=?",
                (sub_id, user_id),
            )
            conn.commit()
            conn.close()

    elif event["type"] in ("customer.subscription.deleted", "customer.subscription.paused"):
        sub = event["data"]["object"]
        sub_id = sub.get("id")
        if sub_id:
            conn = get_connection()
            conn.execute(
                "UPDATE users SET plan='free', stripe_subscription_id='' WHERE stripe_subscription_id=?",
                (sub_id,),
            )
            conn.commit()
            conn.close()

    elif event["type"] == "customer.subscription.updated":
        sub = event["data"]["object"]
        sub_id = sub.get("id")
        status = sub.get("status")
        if sub_id and status:
            new_plan = "pro" if status == "active" else "free"
            conn = get_connection()
            conn.execute(
                "UPDATE users SET plan=? WHERE stripe_subscription_id=?",
                (new_plan, sub_id),
            )
            conn.commit()
            conn.close()

    return {"received": True}


# ===========================================================================
# HEALTH
# ===========================================================================

@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "2.0", "ai": bool(XAI_API_KEY)}
