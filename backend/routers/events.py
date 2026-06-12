"""Events / calendar CRUD endpoints."""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.auth import get_current_user
from backend.deps import require_active_plan
from backend.schemas import EventReq, EventUpdate
from db import (
    delete_row,
    get_connection,
    insert_row,
    update_row,
)

router = APIRouter(tags=["events"], dependencies=[Depends(require_active_plan)])


@router.get("/api/events")
async def list_events(
    upcoming: bool = Query(False),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    user: dict = Depends(get_current_user),
):
    uid = user["user_id"]
    with get_connection() as conn:
        if from_date and to_date:
            rows = conn.execute(
                "SELECT * FROM events WHERE user_id=? "
                "AND substr(event_date, 1, 10) >= ? AND substr(event_date, 1, 10) <= ? "
                "ORDER BY event_date LIMIT ?",
                (uid, from_date, to_date, limit),
            ).fetchall()
        elif upcoming:
            today = date.today().isoformat()
            # Compare date portion only — event_date is stored as "YYYY-MM-DD" or "YYYY-MM-DD HH:MM".
            rows = conn.execute(
                "SELECT * FROM events WHERE user_id=? AND substr(event_date, 1, 10)>=? "
                "ORDER BY event_date LIMIT ?",
                (uid, today, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM events WHERE user_id=? ORDER BY event_date DESC LIMIT ?",
                (uid, limit),
            ).fetchall()
    return [dict(r) for r in rows]


@router.post("/api/events")
async def create_event(body: EventReq, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    evt_id = str(uuid.uuid4())
    event_date = body.date
    if body.time:
        event_date = f"{body.date} {body.time}"
    row = {
        "id": evt_id, "user_id": uid, "title": body.title,
        "description": body.description, "event_date": event_date,
        "event_type": body.event_type, "amount": 0, "is_recurring": 0,
        "recurrence": "", "is_synced_to_google": 0,
        "reminder_minutes": body.reminder_minutes, "reminder_sent": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    insert_row("events", row)
    from core.integrations.google_calendar import push_event_to_google
    push_event_to_google(uid, row)
    return {"id": evt_id}


@router.patch("/api/events/{event_id}")
async def update_event(
    event_id: str, body: EventUpdate, user: dict = Depends(get_current_user)
):
    uid = user["user_id"]
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM events WHERE id=? AND user_id=?", (event_id, uid)
        ).fetchone()
    finally:
        conn.close()
    if not row:
        raise HTTPException(404, "Event not found")

    updates: dict = {}
    fields_set = body.model_fields_set
    if "date" in fields_set or "time" in fields_set:
        old_date_str = (row["event_date"] or "")[:10]
        old_time_str = (
            (row["event_date"] or "")[11:16]
            if len(row["event_date"] or "") > 10
            else ""
        )
        d = body.date if "date" in fields_set else old_date_str
        t = body.time if "time" in fields_set else old_time_str
        updates["event_date"] = f"{d} {t}".strip()
    if "title" in fields_set:
        if not (body.title or "").strip():
            raise HTTPException(422, "Title cannot be empty")
        updates["title"] = body.title.strip()
    if "description" in fields_set:
        updates["description"] = body.description

    if not updates:
        raise HTTPException(400, "No fields to update")
    update_row("events", updates, {"id": event_id, "user_id": uid})
    return {"updated": True}


@router.delete("/api/events/{event_id}")
async def delete_event(event_id: str, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT id FROM events WHERE id=? AND user_id=?", (event_id, uid)
        ).fetchone()
    finally:
        conn.close()
    if not row:
        raise HTTPException(404, "Event not found")
    delete_row("events", {"id": event_id, "user_id": uid})
    return {"deleted": True}
