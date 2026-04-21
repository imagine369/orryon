"""
backend/routers/habits.py — Streak and Reset Anchor endpoints.

Persists habit data (streaks, streak days, reset completions, user preferences)
server-side so it follows the user across devices. The frontend hooks use these
endpoints for authenticated users and fall back to localStorage for demo mode.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.auth import get_current_user
from backend.schemas import (
    HabitsImportReq,
    ResetCompletionReq,
    ResetCompletionUpdate,
    StreakDayToggle,
    StreakReq,
    StreakUpdate,
    UserPreferencesUpdate,
)
from db import delete_row, get_connection, insert_row, update_row

router = APIRouter(tags=["habits"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Streaks ──────────────────────────────────────────────────────────────────


@router.get("/api/streaks")
async def list_streaks(user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM streaks WHERE user_id=? ORDER BY created_at",
            (uid,),
        ).fetchall()
        streaks = []
        for r in rows:
            s = dict(r)
            days = conn.execute(
                "SELECT date_key FROM streak_days WHERE streak_id=? AND user_id=?",
                (s["id"], uid),
            ).fetchall()
            s["completions"] = [dict(d)["date_key"] for d in days]
            streaks.append(s)
    return streaks


@router.post("/api/streaks", status_code=201)
async def create_streak(body: StreakReq, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    streak_id = body.id or f"sk_{uuid.uuid4().hex[:12]}"
    insert_row("streaks", {
        "id": streak_id,
        "user_id": uid,
        "name": body.name.strip(),
        "emoji": (body.emoji or "").strip(),
        "target_days": body.target_days if body.target_days and body.target_days > 0 else None,
        "created_at": _now(),
    })
    return {"id": streak_id}


@router.patch("/api/streaks/{streak_id}")
async def update_streak(
    streak_id: str,
    body: StreakUpdate,
    user: dict = Depends(get_current_user),
):
    uid = user["user_id"]
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")
    if "name" in updates:
        updates["name"] = updates["name"].strip()
    if "emoji" in updates:
        updates["emoji"] = updates["emoji"].strip()
    ok = update_row("streaks", updates, {"id": streak_id, "user_id": uid})
    if not ok:
        raise HTTPException(404, "Streak not found")
    return {"ok": True}


@router.delete("/api/streaks/{streak_id}")
async def delete_streak(streak_id: str, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    with get_connection() as conn:
        conn.execute(
            "DELETE FROM streak_days WHERE streak_id=? AND user_id=?",
            (streak_id, uid),
        )
        conn.execute(
            "DELETE FROM streaks WHERE id=? AND user_id=?",
            (streak_id, uid),
        )
        conn.commit()
    return {"ok": True}


@router.post("/api/streaks/{streak_id}/days")
async def toggle_streak_day(
    streak_id: str,
    body: StreakDayToggle,
    user: dict = Depends(get_current_user),
):
    uid = user["user_id"]
    with get_connection() as conn:
        existing = conn.execute(
            "SELECT id FROM streak_days WHERE streak_id=? AND date_key=? AND user_id=?",
            (streak_id, body.date_key, uid),
        ).fetchone()
        if existing:
            conn.execute(
                "DELETE FROM streak_days WHERE streak_id=? AND date_key=? AND user_id=?",
                (streak_id, body.date_key, uid),
            )
            conn.commit()
            return {"toggled": "off", "date_key": body.date_key}
        else:
            day_id = f"sd_{uuid.uuid4().hex[:12]}"
            conn.execute(
                "INSERT INTO streak_days (id, streak_id, user_id, date_key, created_at) VALUES (?, ?, ?, ?, ?)",
                (day_id, streak_id, uid, body.date_key, _now()),
            )
            conn.commit()
            return {"toggled": "on", "date_key": body.date_key, "id": day_id}


# ── Reset Completions ────────────────────────────────────────────────────────


@router.get("/api/reset-completions")
async def list_reset_completions(
    date: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    uid = user["user_id"]
    with get_connection() as conn:
        if date:
            rows = conn.execute(
                "SELECT * FROM reset_completions WHERE user_id=? AND date_key=? ORDER BY created_at",
                (uid, date),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM reset_completions WHERE user_id=? ORDER BY created_at",
                (uid,),
            ).fetchall()
    return [dict(r) for r in rows]


@router.post("/api/reset-completions", status_code=201)
async def create_reset_completion(
    body: ResetCompletionReq,
    user: dict = Depends(get_current_user),
):
    uid = user["user_id"]
    comp_id = body.id or f"rc_{uuid.uuid4().hex[:12]}"
    now = _now()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    insert_row("reset_completions", {
        "id": comp_id,
        "user_id": uid,
        "anchor_id": body.anchor_id,
        "date_key": today,
        "duration": body.duration,
        "pre_mood": body.pre_mood,
        "post_mood": None,
        "note": None,
        "marked_for_streak": 0,
        "created_at": now,
    })
    return {"id": comp_id}


@router.patch("/api/reset-completions/{completion_id}")
async def update_reset_completion(
    completion_id: str,
    body: ResetCompletionUpdate,
    user: dict = Depends(get_current_user),
):
    uid = user["user_id"]
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")
    ok = update_row("reset_completions", updates, {"id": completion_id, "user_id": uid})
    if not ok:
        raise HTTPException(404, "Completion not found")
    return {"ok": True}


# ── User Preferences ─────────────────────────────────────────────────────────


@router.get("/api/user-preferences")
async def get_preferences(user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM user_preferences WHERE user_id=?", (uid,),
        ).fetchone()
    if row:
        return dict(row)
    return {"user_id": uid, "last_reset_anchor": None}


@router.patch("/api/user-preferences")
async def update_preferences(
    body: UserPreferencesUpdate,
    user: dict = Depends(get_current_user),
):
    uid = user["user_id"]
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")
    with get_connection() as conn:
        existing = conn.execute(
            "SELECT user_id FROM user_preferences WHERE user_id=?", (uid,),
        ).fetchone()
        if existing:
            update_row("user_preferences", updates, {"user_id": uid})
        else:
            insert_row("user_preferences", {"user_id": uid, **updates})
    return {"ok": True}


# ── Bulk Import (localStorage migration) ─────────────────────────────────────


@router.post("/api/habits/import", status_code=200)
async def import_habits(body: HabitsImportReq, user: dict = Depends(get_current_user)):
    """
    Idempotent bulk import: accepts streaks + completions from localStorage
    and upserts them. Uses the client-generated IDs as primary keys so
    re-running never creates duplicates.
    """
    uid = user["user_id"]
    now = _now()
    imported_streaks = 0
    imported_completions = 0

    for s in body.streaks:
        insert_row("streaks", {
            "id": s.id,
            "user_id": uid,
            "name": s.name,
            "emoji": s.emoji or "",
            "target_days": s.target_days,
            "created_at": s.created_at or now,
        })
        imported_streaks += 1
        for date_key in s.completions:
            day_id = f"sd_{uuid.uuid4().hex[:12]}"
            try:
                with get_connection() as conn:
                    conn.execute(
                        "INSERT INTO streak_days (id, streak_id, user_id, date_key, created_at) VALUES (?, ?, ?, ?, ?)",
                        (day_id, s.id, uid, date_key, now),
                    )
                    conn.commit()
            except Exception:
                pass  # UNIQUE constraint = already imported

    for c in body.reset_completions:
        insert_row("reset_completions", {
            "id": c.id,
            "user_id": uid,
            "anchor_id": c.anchor_id,
            "date_key": c.date_key,
            "duration": c.duration,
            "pre_mood": c.pre_mood,
            "post_mood": c.post_mood,
            "note": c.note,
            "marked_for_streak": 1 if c.marked_for_streak else 0,
            "created_at": now,
        })
        imported_completions += 1

    if body.last_reset_anchor:
        with get_connection() as conn:
            existing = conn.execute(
                "SELECT user_id FROM user_preferences WHERE user_id=?", (uid,),
            ).fetchone()
            if existing:
                update_row("user_preferences", {"last_reset_anchor": body.last_reset_anchor}, {"user_id": uid})
            else:
                insert_row("user_preferences", {"user_id": uid, "last_reset_anchor": body.last_reset_anchor})

    return {"imported_streaks": imported_streaks, "imported_completions": imported_completions}
