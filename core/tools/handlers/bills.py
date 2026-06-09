"""Tool handlers — bills."""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timedelta, timezone

from db import (
    delete_row,
    fetch_rows,
    get_connection,
    insert_row,
    update_row,
)
from db.finance import (
    adjust_balance,
    get_balance,
    get_or_create_balance_account,
    update_balance,
)
from core.tools.shared import (
    _now_iso,
    _uid
)

logger = logging.getLogger(__name__)


def _add_recurring_bill(args: dict, user_id: str) -> dict:
    name = args["name"]
    amount = float(args.get("amount", 0))
    frequency = args.get("frequency", "monthly")
    due_date_iso = args.get("due_date")  # preferred: ISO YYYY-MM-DD
    due_day = args.get("due_day")

    # Compute next due date
    now = datetime.now()
    if due_date_iso and re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(due_date_iso)):
        next_due = str(due_date_iso)
    elif due_day and frequency == "monthly":
        try:
            due_day_int = int(due_day)
            if now.day < due_day_int:
                next_due = now.replace(day=due_day_int).strftime("%Y-%m-%d")
            else:
                if now.month == 12:
                    next_due = now.replace(year=now.year + 1, month=1, day=due_day_int).strftime("%Y-%m-%d")
                else:
                    next_due = now.replace(month=now.month + 1, day=due_day_int).strftime("%Y-%m-%d")
        except Exception:
            next_due = (now + timedelta(days=30)).strftime("%Y-%m-%d")
    else:
        next_due = (now + timedelta(days=30)).strftime("%Y-%m-%d")

    row = {
        "id": _uid(),
        "user_id": user_id,
        "name": name,
        "amount": amount,
        "frequency": frequency,
        "next_due": next_due,
        "category": args.get("category", "Utilities"),
        "is_active": 1,
        "detected_at": _now_iso(),
    }
    insert_row("subscriptions", row)
    return {"status": "ok", "id": row["id"], "name": name, "amount": amount, "next_due": next_due}
def _edit_bill(args: dict, user_id: str) -> dict:
    """Edit an existing recurring bill / subscription."""
    bill_id = args.get("bill_id") or args.get("id")
    if not bill_id:
        return {"status": "error", "message": "bill_id is required."}
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM subscriptions WHERE id=? AND user_id=?",
        (bill_id, user_id),
    ).fetchone()
    conn.close()
    if not row:
        return {"status": "not_found", "message": "Bill not found."}

    updates: dict = {}
    for k in ("name", "category", "frequency"):
        if args.get(k) is not None:
            updates[k] = args[k]
    if args.get("amount") is not None:
        try:
            updates["amount"] = float(args["amount"])
        except (TypeError, ValueError):
            pass
    if args.get("due_date"):
        updates["next_due"] = str(args["due_date"])
    if args.get("is_active") is not None:
        updates["is_active"] = 1 if args["is_active"] else 0

    if not updates:
        return {"status": "no_changes", "message": "Nothing to update."}
    update_row("subscriptions", updates, {"id": bill_id, "user_id": user_id})
    return {
        "status": "ok",
        "id": bill_id,
        "name": row["name"],
        "updated_fields": sorted(updates.keys()),
    }
def _delete_bill(args: dict, user_id: str) -> dict:
    bid = args["bill_id"]
    conn = get_connection()
    row = conn.execute("SELECT id, name FROM subscriptions WHERE id=? AND user_id=?", (bid, user_id)).fetchone()
    conn.close()
    if not row:
        return {"status": "not_found", "message": "Bill not found."}
    update_row("subscriptions", {"is_active": 0}, {"id": bid})
    return {"status": "ok", "cancelled": row["name"]}
def _get_bills(args: dict, user_id: str) -> dict:
    """Retrieve bills / subscriptions, optionally filtered by ISO date range."""
    status = (args.get("status") or "active").lower()
    date_range = args.get("date_range") or {}
    date_from = date_range.get("from")
    date_to = date_range.get("to")
    category = args.get("category")

    sql = "SELECT * FROM subscriptions WHERE user_id=?"
    params: list = [user_id]
    if status == "active":
        sql += " AND is_active=1"
    elif status == "inactive":
        sql += " AND is_active=0"
    if category:
        sql += " AND category=?"
        params.append(category)
    if date_from:
        sql += " AND next_due >= ?"
        params.append(date_from)
    if date_to:
        sql += " AND next_due <= ?"
        params.append(date_to)
    sql += " ORDER BY next_due ASC"

    conn = get_connection()
    rows = conn.execute(sql, tuple(params)).fetchall()
    conn.close()
    bills = [dict(r) if not isinstance(r, dict) else r for r in rows]
    total = sum(float(b.get("amount") or 0) for b in bills)
    return {
        "status": "ok",
        "count": len(bills),
        "total": round(total, 2),
        "bills": bills,
    }
