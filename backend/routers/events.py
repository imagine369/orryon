"""Events / calendar CRUD endpoints."""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.auth import get_current_user
from backend.deps import require_active_plan
from backend.schemas import EventReq
from db import delete_row, get_connection, insert_row

router = APIRouter(tags=["events"], dependencies=[Depends(require_active_plan)])


@router.get("/api/events")
async def list_events(
    upcoming: bool = Query(False),
    limit: int = Query(50, le=200),
    user: dict = Depends(get_current_user),
):
    uid = user["user_id"]
    with get_connection() as conn:
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
    return [dict(r) for r in rows]


@router.post("/api/events")
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
