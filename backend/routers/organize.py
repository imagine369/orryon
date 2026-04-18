"""
backend/routers/organize.py — Organizational data endpoints.

Covers events/calendar, goals (with contributions), notes/journal, tasks,
grocery list, and the multi-list system. These power the Schedule, Goals,
and Notes tabs in the Next.js frontend.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.auth import get_current_user
from backend.schemas import (
    EventReq,
    GoalReq,
    GoalUpdate,
    GroceryItemReq,
    ListItemReq,
    ListItemUpdate,
    NoteReq,
    NoteUpdate,
    ReorderReq,
    TaskReq,
    TaskUpdate,
    UserListReq,
    UserListUpdate,
)
from db import get_connection, insert_row, update_row

router = APIRouter(tags=["organize"])


# ── Events ────────────────────────────────────────────────────────────────────

@router.get("/api/events")
async def list_events(
    upcoming: bool = Query(False),
    limit: int = Query(50, le=200),
    user: dict = Depends(get_current_user),
):
    uid = user["user_id"]
    from datetime import date
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
    from db import delete_row
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


# ── Goals ─────────────────────────────────────────────────────────────────────

@router.get("/api/goals")
async def list_goals(
    include_completed: bool = Query(False),
    user: dict = Depends(get_current_user),
):
    uid = user["user_id"]
    with get_connection() as conn:
        if include_completed:
            rows = conn.execute(
                "SELECT * FROM goals WHERE user_id=? ORDER BY is_completed ASC, created_at DESC", (uid,)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM goals WHERE user_id=? AND is_completed=0 ORDER BY created_at DESC", (uid,)
            ).fetchall()
    return [dict(r) for r in rows]


@router.post("/api/goals")
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


@router.patch("/api/goals/{goal_id}")
async def update_goal(goal_id: str, body: GoalUpdate, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")

    conn = get_connection()
    try:
        old = conn.execute(
            "SELECT current_amount FROM goals WHERE id=? AND user_id=?", (goal_id, uid)
        ).fetchone()
    finally:
        conn.close()
    if not old:
        raise HTTPException(404, "Goal not found")

    if "current_amount" in updates:
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

    update_row("goals", updates, {"id": goal_id, "user_id": uid})
    return {"updated": True}


@router.get("/api/goals/{goal_id}/contributions")
async def get_goal_contributions(goal_id: str, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM goal_contributions WHERE goal_id=? AND user_id=? ORDER BY created_at DESC",
            (goal_id, uid),
        ).fetchall()
    return [dict(r) for r in rows]


@router.post("/api/goals/{goal_id}/contributions")
async def add_goal_contribution(goal_id: str, body: dict, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    amount = float(body.get("amount", 0))
    if amount == 0:
        raise HTTPException(400, "Amount required")
    conn = get_connection()
    try:
        goal = conn.execute(
            "SELECT current_amount FROM goals WHERE id=? AND user_id=?", (goal_id, uid)
        ).fetchone()
    finally:
        conn.close()
    if not goal:
        raise HTTPException(404, "Goal not found")
    new_amount = float(goal["current_amount"]) + amount
    update_row("goals", {"current_amount": new_amount}, {"id": goal_id, "user_id": uid})
    insert_row("goal_contributions", {
        "id": str(uuid.uuid4()),
        "goal_id": goal_id,
        "user_id": uid,
        "amount": amount,
        "note": body.get("note", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"current_amount": new_amount}


# ── Notes ─────────────────────────────────────────────────────────────────────

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
    from db import delete_row
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


# ── Tasks ─────────────────────────────────────────────────────────────────────

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
    from db import delete_row
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


# ── Grocery ───────────────────────────────────────────────────────────────────

@router.get("/api/grocery")
async def list_grocery(user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM grocery_items WHERE user_id=? ORDER BY is_checked ASC, added_at DESC",
            (uid,),
        ).fetchall()
    return [dict(r) for r in rows]


@router.post("/api/grocery/reorder")
async def reorder_grocery(body: ReorderReq, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    with get_connection() as conn:
        for i, item_id in enumerate(body.ids):
            conn.execute(
                "UPDATE grocery_items SET sort_order=? WHERE id=? AND user_id=?",
                (i, item_id, uid),
            )
        conn.commit()
    return {"reordered": True}


@router.post("/api/grocery")
async def add_grocery_item(body: GroceryItemReq, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    item_id = str(uuid.uuid4())
    insert_row("grocery_items", {
        "id": item_id, "user_id": uid, "name": body.name,
        "quantity": body.quantity, "estimated_price": 0,
        "is_checked": 0, "added_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"id": item_id}


@router.patch("/api/grocery/{item_id}")
async def toggle_grocery(item_id: str, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT is_checked FROM grocery_items WHERE id=? AND user_id=?",
            (item_id, uid),
        ).fetchone()
    finally:
        conn.close()
    if not row:
        raise HTTPException(404, "Item not found")
    new_val = 0 if row["is_checked"] else 1
    update_row("grocery_items", {"is_checked": new_val}, {"id": item_id, "user_id": uid})
    return {"is_checked": new_val}


@router.delete("/api/grocery/{item_id}")
async def delete_grocery(item_id: str, user: dict = Depends(get_current_user)):
    from db import delete_row
    uid = user["user_id"]
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT id FROM grocery_items WHERE id=? AND user_id=?", (item_id, uid)
        ).fetchone()
    finally:
        conn.close()
    if not row:
        raise HTTPException(404, "Item not found")
    delete_row("grocery_items", {"id": item_id, "user_id": uid})
    return {"deleted": True}


# ── User Lists (multi-list system) ───────────────────────────────────────────

@router.get("/api/lists")
async def get_lists(user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    with get_connection() as conn:
        lists = conn.execute(
            "SELECT * FROM user_lists WHERE user_id=? ORDER BY sort_order ASC, created_at ASC",
            (uid,),
        ).fetchall()
        result = []
        for lst in lists:
            d = dict(lst)
            _cnt_row = conn.execute(
                "SELECT COUNT(*) as cnt FROM list_items WHERE list_id=? AND is_checked=0", (d["id"],)
            ).fetchone()
            d["item_count"] = _cnt_row["cnt"] if isinstance(_cnt_row, dict) else _cnt_row[0]
            result.append(d)
    return result


@router.post("/api/lists")
async def create_list(body: UserListReq, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    list_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    with get_connection() as conn:
        _mo_row = conn.execute(
            "SELECT COALESCE(MAX(sort_order),0) as val FROM user_lists WHERE user_id=?", (uid,)
        ).fetchone()
    max_order = _mo_row["val"] if isinstance(_mo_row, dict) else _mo_row[0]
    insert_row("user_lists", {
        "id": list_id, "user_id": uid, "name": body.name,
        "icon": body.icon, "color": body.color,
        "sort_order": max_order + 1, "created_at": now,
    })
    return {"id": list_id}


@router.patch("/api/lists/{list_id}")
async def update_list(list_id: str, body: UserListUpdate, user: dict = Depends(get_current_user)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if updates:
        update_row("user_lists", updates, {"id": list_id, "user_id": user["user_id"]})
    return {"updated": True}


@router.delete("/api/lists/{list_id}")
async def delete_list(list_id: str, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    with get_connection() as conn:
        conn.execute("DELETE FROM list_items WHERE list_id=? AND user_id=?", (list_id, uid))
        conn.execute("DELETE FROM user_lists WHERE id=? AND user_id=?", (list_id, uid))
        conn.commit()
    return {"deleted": True}


@router.get("/api/lists/{list_id}/items")
async def get_list_items(list_id: str, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM list_items WHERE list_id=? AND user_id=? ORDER BY is_checked ASC, sort_order ASC, added_at ASC",
            (list_id, uid),
        ).fetchall()
    return [dict(r) for r in rows]


@router.post("/api/lists/{list_id}/items")
async def add_list_item(list_id: str, body: ListItemReq, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    item_id = str(uuid.uuid4())
    with get_connection() as conn:
        # Verify list ownership before adding the item, otherwise an attacker
        # could create orphaned items under someone else's list_id.
        owner = conn.execute(
            "SELECT id FROM user_lists WHERE id=? AND user_id=?", (list_id, uid)
        ).fetchone()
        if not owner:
            raise HTTPException(404, "List not found")
        _mo_row = conn.execute(
            "SELECT COALESCE(MAX(sort_order),0) as val FROM list_items WHERE list_id=?", (list_id,)
        ).fetchone()
        max_order = _mo_row["val"] if isinstance(_mo_row, dict) else _mo_row[0]
    insert_row("list_items", {
        "id": item_id, "list_id": list_id, "user_id": uid,
        "name": body.name, "notes": body.notes or "",
        "is_checked": 0, "sort_order": max_order + 1,
        "added_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"id": item_id}


@router.patch("/api/list-items/{item_id}")
async def update_list_item(item_id: str, body: ListItemUpdate, user: dict = Depends(get_current_user)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if updates:
        update_row("list_items", updates, {"id": item_id, "user_id": user["user_id"]})
    return {"updated": True}


@router.delete("/api/list-items/{item_id}")
async def delete_list_item(item_id: str, user: dict = Depends(get_current_user)):
    with get_connection() as conn:
        conn.execute("DELETE FROM list_items WHERE id=? AND user_id=?", (item_id, user["user_id"]))
        conn.commit()
    return {"deleted": True}


@router.post("/api/lists/{list_id}/reorder")
async def reorder_list_items(list_id: str, body: ReorderReq, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    with get_connection() as conn:
        for i, item_id in enumerate(body.ids):
            conn.execute(
                "UPDATE list_items SET sort_order=? WHERE id=? AND user_id=?",
                (i, item_id, uid),
            )
        conn.commit()
    return {"reordered": True}
