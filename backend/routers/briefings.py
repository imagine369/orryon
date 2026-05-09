"""
backend/routers/briefings.py — Daily briefing generation and delivery.

GET  /api/briefing/today        — fetch (or generate) today's briefing
POST /api/briefing/mark-read    — mark today's briefing as read
GET  /api/briefing/preferences  — get briefing prefs
POST /api/briefing/preferences  — update briefing prefs
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.auth import get_current_user
from backend.deps import require_active_plan
from db import (
    get_briefing,
    save_briefing,
    mark_briefing_read,
    get_user_preferences,
    upsert_user_preferences,
    get_connection,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["briefings"], dependencies=[Depends(require_active_plan)])


async def _generate_briefing(user_id: str, date: str, user_name: str, prefs: dict) -> dict:
    """Use Grok to compose a personalised morning briefing."""
    includes = (prefs.get("briefing_includes") or "finance,health,calendar,goals").split(",")

    sections: list[str] = []

    if "finance" in includes:
        try:
            conn = get_connection()
            row = conn.execute(
                "SELECT COALESCE(SUM(amount),0) as total FROM transactions "
                "WHERE user_id=? AND date>=? AND amount<0",
                (user_id, date[:7] + "-01"),
            ).fetchone()
            conn.close()
            spent = abs(float(row["total"])) if row else 0
            sections.append(f"Spending this month: ${spent:,.2f} so far.")
        except Exception:
            pass

    if "calendar" in includes:
        try:
            conn = get_connection()
            rows = conn.execute(
                "SELECT title, date FROM events WHERE user_id=? AND date>=? ORDER BY date LIMIT 3",
                (user_id, date),
            ).fetchall()
            conn.close()
            if rows:
                events_str = ", ".join(f"{r['title']} ({r['date']})" for r in rows)
                sections.append(f"Upcoming: {events_str}.")
        except Exception:
            pass

    if "health" in includes:
        try:
            conn = get_connection()
            rows = conn.execute(
                "SELECT name, next_dose_at FROM medications WHERE user_id=? AND active=1 LIMIT 3",
                (user_id,),
            ).fetchall()
            conn.close()
            if rows:
                meds_str = ", ".join(r["name"] for r in rows)
                sections.append(f"Medications today: {meds_str}.")
        except Exception:
            pass

    if "goals" in includes:
        try:
            conn = get_connection()
            rows = conn.execute(
                "SELECT name, target_amount, current_amount FROM goals WHERE user_id=? AND status='active' LIMIT 2",
                (user_id,),
            ).fetchall()
            conn.close()
            if rows:
                goal_parts = []
                for g in rows:
                    if g["target_amount"] and g["target_amount"] > 0:
                        pct = min(100, int((g["current_amount"] or 0) / g["target_amount"] * 100))
                        goal_parts.append(f"{g['name']} {pct}%")
                if goal_parts:
                    sections.append(f"Goals: {', '.join(goal_parts)}.")
        except Exception:
            pass

    summary = " ".join(sections) if sections else "A calm start to your day."

    return {
        "date": date,
        "greeting": f"Good morning, {user_name}.",
        "summary": summary,
        "sections": sections,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/api/briefing/today")
async def get_today_briefing(user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    existing = get_briefing(uid, today)
    if existing:
        try:
            content = json.loads(existing.get("content_json") or "{}")
        except Exception:
            content = {}
        return {
            "briefing": content,
            "date": today,
            "read": bool(existing.get("read_at")),
        }

    conn = get_connection()
    user_row = conn.execute("SELECT display_name FROM users WHERE id=?", (uid,)).fetchone()
    conn.close()
    user_name = (user_row["display_name"] if user_row else None) or "there"

    prefs = get_user_preferences(uid)
    content = await _generate_briefing(uid, today, user_name, prefs)
    save_briefing(uid, today, content)

    return {"briefing": content, "date": today, "read": False}


@router.post("/api/briefing/mark-read")
async def mark_read(user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    mark_briefing_read(user["user_id"], today)
    return {"marked": True}


class BriefingPrefsReq(BaseModel):
    briefing_time: str | None = None       # "07:00"
    briefing_includes: str | None = None   # "finance,health,calendar,goals"


@router.get("/api/briefing/preferences")
async def get_briefing_prefs(user: dict = Depends(get_current_user)):
    prefs = get_user_preferences(user["user_id"])
    return {
        "briefing_time": prefs.get("briefing_time", "07:00"),
        "briefing_includes": prefs.get("briefing_includes", "finance,health,calendar,goals"),
    }


@router.post("/api/briefing/preferences")
async def save_briefing_prefs(body: BriefingPrefsReq, user: dict = Depends(get_current_user)):
    updates: dict = {}
    if body.briefing_time is not None:
        updates["briefing_time"] = body.briefing_time
    if body.briefing_includes is not None:
        updates["briefing_includes"] = body.briefing_includes
    if updates:
        upsert_user_preferences(user["user_id"], updates)
    return {"updated": True}
