"""Grocery list, user lists, and list items."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from backend.auth import get_current_user
from backend.deps import require_active_plan
from backend.schemas import ListItemReq, ListItemUpdate, ReorderReq, UserListReq, UserListUpdate
from core.grocery_list import (
    ensure_grocery_list_ready,
    grocery_list_sort_key,
    is_builtin_grocery_list,
    is_grocery_list_name,
    resolve_list_items_list_id,
)
from db import (
    delete_row,
    get_connection,
    insert_row,
    update_row,
)

router = APIRouter(tags=["lists"], dependencies=[Depends(require_active_plan)])


# ── Lists (built-in Grocery + custom lists) ───────────────────────────────────

@router.get("/api/lists")
async def get_lists(user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    canonical_grocery_id = ensure_grocery_list_ready(uid)
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
            d["is_builtin"] = d["id"] == canonical_grocery_id
            result.append(d)
    result.sort(key=grocery_list_sort_key)
    return result


@router.post("/api/lists")
async def create_list(body: UserListReq, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    if is_grocery_list_name(body.name):
        return {"id": ensure_grocery_list_ready(uid)}
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
    uid = user["user_id"]
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if is_builtin_grocery_list(uid, list_id):
        updates.pop("name", None)
    if updates:
        update_row("user_lists", updates, {"id": list_id, "user_id": uid})
    return {"updated": True}


@router.delete("/api/lists/{list_id}")
async def delete_list(list_id: str, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    if is_builtin_grocery_list(uid, list_id):
        raise HTTPException(
            status_code=400,
            detail="The Grocery list is built in and can't be deleted. Clear its items instead.",
        )
    with get_connection() as conn:
        conn.execute("DELETE FROM list_items WHERE list_id=? AND user_id=?", (list_id, uid))
        conn.execute("DELETE FROM user_lists WHERE id=? AND user_id=?", (list_id, uid))
        conn.commit()
    return {"deleted": True}


@router.get("/api/lists/{list_id}/items")
async def get_list_items(list_id: str, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    list_id = resolve_list_items_list_id(uid, list_id)
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM list_items WHERE list_id=? AND user_id=? ORDER BY is_checked ASC, sort_order ASC, added_at ASC",
            (list_id, uid),
        ).fetchall()
    return [dict(r) for r in rows]


@router.post("/api/lists/{list_id}/items")
async def add_list_item(list_id: str, body: ListItemReq, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    list_id = resolve_list_items_list_id(uid, list_id)
    item_id = str(uuid.uuid4())
    with get_connection() as conn:
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
