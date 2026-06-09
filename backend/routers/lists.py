"""Grocery list, user lists, and list items."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from backend.auth import get_current_user
from backend.deps import require_active_plan
from backend.schemas import GroceryItemReq, ListItemReq, ListItemUpdate, ReorderReq, UserListReq, UserListUpdate
from db import (
    delete_row,
    get_connection,
    insert_row,
    update_row,
)

router = APIRouter(tags=["lists"], dependencies=[Depends(require_active_plan)])

GROCERY_LIST_NAME = "Grocery"
GROCERY_LIST_COLOR = "#22c55e"


def _ensure_grocery_list(uid: str) -> str:
    """Return the id of this user's Grocery list, creating it if missing."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id FROM user_lists WHERE user_id=? AND LOWER(name)=LOWER(?) "
            "ORDER BY created_at ASC LIMIT 1",
            (uid, GROCERY_LIST_NAME),
        ).fetchone()
        if row:
            return row["id"] if isinstance(row, dict) else row[0]

    list_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    insert_row("user_lists", {
        "id": list_id,
        "user_id": uid,
        "name": GROCERY_LIST_NAME,
        "icon": "",
        "color": GROCERY_LIST_COLOR,
        "sort_order": 0,
        "created_at": now,
    })
    return list_id


def _is_builtin_grocery(uid: str, list_id: str) -> bool:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT name FROM user_lists WHERE id=? AND user_id=?", (list_id, uid),
        ).fetchone()
    if not row:
        return False
    name = row["name"] if isinstance(row, dict) else row[0]
    return str(name or "").lower() == GROCERY_LIST_NAME.lower()


# ── Legacy grocery table (Schedule tab) ───────────────────────────────────────

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


# ── Multi-list system ─────────────────────────────────────────────────────────

@router.get("/api/lists")
async def get_lists(user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    _ensure_grocery_list(uid)
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
            d["is_builtin"] = (str(d.get("name", "")).lower() == GROCERY_LIST_NAME.lower())
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
    uid = user["user_id"]
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if _is_builtin_grocery(uid, list_id):
        updates.pop("name", None)
    if updates:
        update_row("user_lists", updates, {"id": list_id, "user_id": uid})
    return {"updated": True}


@router.delete("/api/lists/{list_id}")
async def delete_list(list_id: str, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    if _is_builtin_grocery(uid, list_id):
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
