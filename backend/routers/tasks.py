"""Action items / tasks endpoints."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.auth import get_current_user
from backend.deps import require_active_plan
from backend.schemas import ReorderReq, TaskReq, TaskUpdate
from db import (
    delete_row,
    get_connection,
    insert_row,
    update_row,
)

router = APIRouter(tags=["tasks"], dependencies=[Depends(require_active_plan)])


@router.get("/api/tasks")
async def list_tasks(
    status: Optional[str] = None,
    limit: int = Query(50, le=200),
    sort: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    uid = user["user_id"]
    query = "SELECT * FROM action_items WHERE user_id=?"
    params: list = [uid]
    if status:
        query += " AND status=?"
        params.append(status)
    if sort == "name":
        query += " ORDER BY title ASC LIMIT ?"
    elif sort == "date":
        query += " ORDER BY CASE WHEN due_date IS NULL OR due_date='' THEN 1 ELSE 0 END, due_date ASC LIMIT ?"
    elif sort == "manual":
        query += " ORDER BY sort_order ASC, created_at ASC LIMIT ?"
    else:
        query += " ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END, due_date ASC LIMIT ?"
    params.append(limit)
    with get_connection() as conn:
        rows = conn.execute(query, params).fetchall()
    return [dict(r) for r in rows]


@router.post("/api/tasks/reorder")
async def reorder_tasks(body: ReorderReq, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    with get_connection() as conn:
        for i, task_id in enumerate(body.ids):
            conn.execute(
                "UPDATE action_items SET sort_order=? WHERE id=? AND user_id=?",
                (i, task_id, uid),
            )
        conn.commit()
    return {"reordered": True}


@router.post("/api/tasks")
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


@router.patch("/api/tasks/{task_id}")
async def update_task(task_id: str, body: TaskUpdate, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT id FROM action_items WHERE id=? AND user_id=?", (task_id, uid)
        ).fetchone()
    finally:
        conn.close()
    if not row:
        raise HTTPException(404, "Task not found")
    update_row("action_items", updates, {"id": task_id, "user_id": uid})
    return {"updated": True}


@router.delete("/api/tasks/{task_id}")
async def delete_task(task_id: str, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT id FROM action_items WHERE id=? AND user_id=?", (task_id, uid)
        ).fetchone()
    finally:
        conn.close()
    if not row:
        raise HTTPException(404, "Task not found")
    delete_row("action_items", {"id": task_id, "user_id": uid})
    return {"deleted": True}
