"""Tool handlers — calendar."""
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
    _reminder_label,
    _today,
    _uid
)

logger = logging.getLogger(__name__)


def _add_calendar_event(args: dict, user_id: str) -> dict:
    title = args["title"]
    start = args.get("start")
    if start:
        s = str(start).replace("T", " ")
        date, _, time = s.partition(" ")
        time = (time or "").strip()[:5]  # HH:MM
    else:
        date = args.get("date") or _today()
        time = args.get("time", "") or ""
    if args.get("all_day") is True:
        time = ""
    event_datetime = f"{date} {time}".strip()
    reminder = int(args.get("reminder_minutes", 30))

    conn = get_connection()
    user_row = conn.execute(
        "SELECT default_reminder_minutes FROM users WHERE id=?", (user_id,)
    ).fetchone()
    conn.close()
    if "reminder_minutes" not in args and user_row and user_row["default_reminder_minutes"] is not None:
        reminder = int(user_row["default_reminder_minutes"])

    row = {
        "id": _uid(),
        "user_id": user_id,
        "title": title,
        "description": args.get("description", ""),
        "event_date": event_datetime,
        "event_type": args.get("event_type", "event"),
        "amount": 0,
        "is_recurring": 0,
        "reminder_minutes": reminder,
        "reminder_sent": 0,
        "created_at": _now_iso(),
    }
    insert_row("events", row)

    reminder_label = _reminder_label(reminder)
    return {
        "status": "ok", "id": row["id"], "title": title,
        "date": date, "time": time, "reminder": reminder_label,
    }
def _add_task(args: dict, user_id: str) -> dict:
    row = {
        "id": _uid(),
        "user_id": user_id,
        "title": args["title"],
        "description": args.get("description", ""),
        "priority": args.get("priority", "medium"),
        "status": "open",
        "due_date": args.get("due_date", ""),
        "category": args.get("category", "personal"),
        "created_by": "orryon",
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    insert_row("action_items", row)
    return {"status": "ok", "id": row["id"], "title": row["title"], "due_date": row["due_date"]}
def _complete_task(args: dict, user_id: str) -> dict:
    title = args["task_title"].lower()
    conn = get_connection()
    rows = conn.execute(
        "SELECT id, title FROM action_items WHERE user_id=? AND status='open'",
        (user_id,),
    ).fetchall()
    conn.close()
    matched = next((r for r in rows if title in r["title"].lower()), None)
    if matched:
        update_row("action_items", {"status": "done", "updated_at": _now_iso()}, {"id": matched["id"]})
        return {"status": "ok", "completed": matched["title"]}
    return {"status": "not_found", "searched": args["task_title"]}
def _get_upcoming_schedule(args: dict, user_id: str) -> dict:
    days = int(args.get("days", 14))
    now = datetime.now()
    end_date = (now + timedelta(days=days)).strftime("%Y-%m-%d")
    today = now.strftime("%Y-%m-%d")

    conn = get_connection()
    events = conn.execute(
        "SELECT * FROM events WHERE user_id=? AND event_date>=? ORDER BY event_date ASC LIMIT 20",
        (user_id, today),
    ).fetchall()
    tasks = conn.execute(
        "SELECT * FROM action_items WHERE user_id=? AND status='open' ORDER BY due_date ASC LIMIT 10",
        (user_id,),
    ).fetchall()
    bills = conn.execute(
        "SELECT * FROM subscriptions WHERE user_id=? AND is_active=1 AND next_due>=? AND next_due<=? ORDER BY next_due ASC",
        (user_id, today, end_date),
    ).fetchall()
    conn.close()

    items = []
    for e in events:
        items.append({
            "type": "event",
            "title": e["title"],
            "date": e["event_date"][:10] if e["event_date"] else "",
            "time": e["event_date"][11:16] if len(e["event_date"] or "") > 10 else "",
        })
    for t in tasks:
        items.append({
            "type": "task",
            "title": t["title"],
            "date": t["due_date"] or "",
            "priority": t["priority"],
        })
    for b in bills:
        items.append({
            "type": "bill",
            "title": b["name"],
            "date": b["next_due"],
            "amount": b["amount"],
        })

    items.sort(key=lambda x: x.get("date") or "9999")
    return {"status": "ok", "days_ahead": days, "items": items, "count": len(items)}
def _delete_event(args: dict, user_id: str) -> dict:
    event_id = args["event_id"]
    conn = get_connection()
    row = conn.execute(
        "SELECT id, title FROM events WHERE id=? AND user_id=?",
        (event_id, user_id),
    ).fetchone()
    conn.close()
    if not row:
        return {"status": "not_found", "message": "Event not found."}
    delete_row("events", {"id": event_id, "user_id": user_id})
    return {"status": "ok", "deleted": row["title"]}
def _delete_task(args: dict, user_id: str) -> dict:
    task_id = args["task_id"]
    conn = get_connection()
    row = conn.execute(
        "SELECT id, title FROM action_items WHERE id=? AND user_id=?",
        (task_id, user_id),
    ).fetchone()
    conn.close()
    if not row:
        return {"status": "not_found", "message": "Task not found."}
    delete_row("action_items", {"id": task_id, "user_id": user_id})
    return {"status": "ok", "deleted": row["title"]}
def _edit_event(args: dict, user_id: str) -> dict:
    eid = args["event_id"]
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM events WHERE id=? AND user_id=?", (eid, user_id)
    ).fetchone()
    conn.close()
    if not row:
        return {"status": "not_found", "message": "Event not found."}
    updates = {}
    new_date = args.get("date")
    new_time = args.get("time")
    if new_date or new_time:
        old_date_str = (row["event_date"] or "")[:10]
        old_time_str = (row["event_date"] or "")[11:16] if len(row["event_date"] or "") > 10 else ""
        d = new_date or old_date_str
        t = new_time or old_time_str
        updates["event_date"] = f"{d} {t}".strip()
    if "title" in args:
        updates["title"] = args["title"]
    if "description" in args:
        updates["description"] = args["description"]
    if not updates:
        return {"status": "no_changes"}
    update_row("events", updates, {"id": eid})
    return {"status": "ok", "id": eid, "updated": list(updates.keys()), "title": updates.get("title", row["title"])}
def _edit_task(args: dict, user_id: str) -> dict:
    tid = args["task_id"]
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM action_items WHERE id=? AND user_id=?", (tid, user_id)
    ).fetchone()
    conn.close()
    if not row:
        return {"status": "not_found", "message": "Task not found."}
    updates = {"updated_at": _now_iso()}
    if "title" in args:
        updates["title"] = args["title"]
    if "due_date" in args:
        updates["due_date"] = args["due_date"]
    if "priority" in args:
        updates["priority"] = args["priority"]
    update_row("action_items", updates, {"id": tid})
    return {"status": "ok", "id": tid, "updated": list(updates.keys()), "title": updates.get("title", row["title"])}
