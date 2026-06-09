"""ICS calendar import (no OAuth required)."""

from __future__ import annotations

import logging
import uuid
from datetime import date as date_type
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from backend.auth import get_current_user
from db import get_connection, insert_row

router = APIRouter(tags=["calendar"])
logger = logging.getLogger(__name__)


def _dt_to_iso(dt_val) -> str | None:
    if dt_val is None:
        return None
    if hasattr(dt_val, "dt"):
        dt_val = dt_val.dt
    if isinstance(dt_val, datetime):
        return dt_val.strftime("%Y-%m-%d %H:%M")
    if isinstance(dt_val, date_type):
        return dt_val.isoformat()
    return str(dt_val)


def _safe_str(val) -> str:
    if val is None:
        return ""
    if hasattr(val, "to_ical"):
        return val.to_ical().decode("utf-8", errors="replace")
    return str(val)


@router.post("/api/calendar/import/ics")
async def import_ics(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """Upload a .ics file and import events into the user's calendar."""
    try:
        from icalendar import Calendar
    except ImportError:
        raise HTTPException(status_code=500, detail="ICS parser not available. Run: pip install icalendar")

    if not file.filename or not file.filename.lower().endswith(".ics"):
        raise HTTPException(status_code=422, detail="Please upload a .ics file.")

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 10 MB).")

    try:
        cal = Calendar.from_ical(content)
    except Exception as exc:
        logger.error("ICS parse error: %s", exc)
        raise HTTPException(status_code=422, detail="Could not parse the .ics file. Make sure it's a valid calendar export.")

    uid = user["user_id"]
    with get_connection() as conn:
        existing_ids = {
            row[0]
            for row in conn.execute(
                "SELECT external_uid FROM events WHERE user_id=? AND external_uid IS NOT NULL", (uid,)
            ).fetchall()
        }

    cutoff = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    cutoff_naive = cutoff.replace(tzinfo=None)

    imported = 0
    skipped = 0

    for component in cal.walk():
        if component.name != "VEVENT":
            continue

        external_uid = _safe_str(component.get("UID")) or str(uuid.uuid4())
        if external_uid in existing_ids:
            skipped += 1
            continue

        dtstart = _dt_to_iso(component.get("DTSTART"))
        if not dtstart:
            continue

        try:
            start_dt_raw = component.get("DTSTART")
            if hasattr(start_dt_raw, "dt"):
                start_raw = start_dt_raw.dt
            else:
                start_raw = start_dt_raw

            if isinstance(start_raw, datetime):
                start_cmp = start_raw.replace(tzinfo=None) if start_raw.tzinfo else start_raw
                if start_cmp < cutoff_naive.replace(day=cutoff_naive.day - min(cutoff_naive.day - 1, 30)):
                    skipped += 1
                    continue
            elif isinstance(start_raw, date_type):
                import datetime as dt_mod
                thirty_days_ago = (cutoff_naive - dt_mod.timedelta(days=30)).date()
                if start_raw < thirty_days_ago:
                    skipped += 1
                    continue
        except Exception:
            pass

        title = _safe_str(component.get("SUMMARY")) or "Untitled event"
        description = _safe_str(component.get("DESCRIPTION")) or ""
        location = _safe_str(component.get("LOCATION")) or ""
        if location and description:
            description = f"{description}\n📍 {location}"
        elif location:
            description = f"📍 {location}"

        evt_id = str(uuid.uuid4())
        try:
            insert_row("events", {
                "id": evt_id,
                "user_id": uid,
                "title": title[:200],
                "description": description[:500],
                "event_date": dtstart,
                "event_type": "event",
                "amount": 0,
                "is_recurring": 0,
                "recurrence": "",
                "is_synced_to_google": 1,
                "reminder_minutes": 30,
                "reminder_sent": 0,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "external_uid": external_uid,
            })
            existing_ids.add(external_uid)
            imported += 1
        except Exception as exc:
            logger.warning("Failed to insert event '%s': %s", title, exc)

    logger.info("ICS import for user %s: %d imported, %d skipped", uid, imported, skipped)
    return {
        "imported": imported,
        "skipped": skipped,
        "message": f"Imported {imported} event{'s' if imported != 1 else ''}."
        + (f" {skipped} skipped (duplicates or old)." if skipped else ""),
    }


@router.get("/api/calendar/import/status")
async def import_status(user: dict = Depends(get_current_user)):
    """Return the number of externally-synced events for this user."""
    uid = user["user_id"]
    with get_connection() as conn:
        row = conn.execute(
            "SELECT COUNT(*) FROM events WHERE user_id=? AND is_synced_to_google=1", (uid,)
        ).fetchone()
    return {"synced_count": row[0] if row else 0}
