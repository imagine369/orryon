"""Notes / journal endpoints."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.auth import get_current_user
from backend.deps import require_active_plan
from backend.schemas import NoteReq, NoteUpdate
from db import delete_row, get_connection, insert_row, update_row

router = APIRouter(tags=["notes"], dependencies=[Depends(require_active_plan)])


@router.get("/api/notes")
async def list_notes(
    search: Optional[str] = None,
    mood: Optional[str] = None,
    tag: Optional[str] = None,
    limit: int = Query(50, le=200),
    user: dict = Depends(get_current_user),
):
    uid = user["user_id"]
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
    with get_connection() as conn:
        rows = conn.execute(query, params).fetchall()
    return [dict(r) for r in rows]


@router.post("/api/notes")
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


@router.patch("/api/notes/{note_id}")
async def update_note(note_id: str, body: NoteUpdate, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT id FROM notes WHERE id=? AND user_id=?", (note_id, uid)
        ).fetchone()
    finally:
        conn.close()
    if not row:
        raise HTTPException(404, "Note not found")
    update_row("notes", updates, {"id": note_id, "user_id": uid})
    return {"updated": True}


@router.delete("/api/notes/{note_id}")
async def delete_note(note_id: str, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT id FROM notes WHERE id=? AND user_id=?", (note_id, uid)
        ).fetchone()
    finally:
        conn.close()
    if not row:
        raise HTTPException(404, "Note not found")
    delete_row("notes", {"id": note_id, "user_id": uid})
    return {"deleted": True}
