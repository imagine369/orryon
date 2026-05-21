"""Tool handlers — lists."""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timedelta, timezone

from db import (
    delete_row, fetch_rows, get_connection, insert_row, update_row, get_balance, adjust_balance, update_balance, get_or_create_balance_account
)
from core.tools.shared import (
    _now_iso,
    _uid
)

logger = logging.getLogger(__name__)


def _add_grocery_items(args: dict, user_id: str) -> dict:
    """Add items to the user's Grocery list.

    Routes through the `user_lists` / `list_items` tables that the in-app
    Lists tab actually reads from (a previous implementation wrote only to
    a legacy `grocery_items` table that no UI surfaced, so chat-added items
    appeared to vanish). We find-or-create a `user_lists` row named
    "Grocery" and append the items there. The legacy `grocery_items` table
    is kept in sync too so the marketing landing page's `/api/grocery`
    preview keeps working without redeploys.
    """
    raw_items = args.get("items", []) or []
    if not raw_items:
        return {"status": "ok", "added": [], "count_added": 0}

    now = _now_iso()

    # 1) Find-or-create the canonical "Grocery" user_list for this user.
    conn = get_connection()
    existing = conn.execute(
        "SELECT id FROM user_lists WHERE user_id=? AND LOWER(name)='grocery' "
        "ORDER BY created_at ASC LIMIT 1",
        (user_id,),
    ).fetchone()
    if existing:
        list_id = existing["id"] if isinstance(existing, dict) else existing[0]
        order_row = conn.execute(
            "SELECT COALESCE(MAX(sort_order),0) AS val FROM list_items WHERE list_id=?",
            (list_id,),
        ).fetchone()
        max_item_order = order_row["val"] if isinstance(order_row, dict) else order_row[0]
    else:
        list_order_row = conn.execute(
            "SELECT COALESCE(MAX(sort_order),0) AS val FROM user_lists WHERE user_id=?",
            (user_id,),
        ).fetchone()
        max_list_order = list_order_row["val"] if isinstance(list_order_row, dict) else list_order_row[0]
        list_id = _uid()
        insert_row("user_lists", {
            "id": list_id,
            "user_id": user_id,
            "name": "Grocery",
            "icon": "",
            "color": "#22c55e",  # green — matches the grocery / food theme in the palette
            "sort_order": max_list_order + 1,
            "created_at": now,
        })
        max_item_order = 0
    conn.close()

    # 2) Insert each item into both the user_list (UI-visible) and the
    #    legacy grocery_items table (marketing-page preview).
    items_added: list[str] = []
    total_est = 0.0
    for i, item in enumerate(raw_items):
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        price = float(item.get("estimated_price", 0) or 0)
        total_est += price

        insert_row("list_items", {
            "id": _uid(),
            "list_id": list_id,
            "user_id": user_id,
            "name": name,
            "notes": "",
            "is_checked": 0,
            "sort_order": max_item_order + 1 + i,
            "added_at": now,
        })
        insert_row("grocery_items", {
            "id": _uid(),
            "user_id": user_id,
            "name": name,
            "quantity": str(item.get("quantity", "1")),
            "estimated_price": price,
            "is_checked": 0,
            "added_at": now,
        })
        items_added.append(name)

    all_items = fetch_rows("list_items", {"list_id": list_id, "user_id": user_id, "is_checked": 0})
    return {
        "status": "ok",
        "list_id": list_id,
        "list_name": "Grocery",
        "added": items_added,
        "count_added": len(items_added),
        "total_list_count": len(all_items),
        "estimated_total_added": total_est,
    }
def _delete_list(args: dict, user_id: str) -> dict:
    """Delete a user list and all its items."""
    list_id = args.get("list_id") or args.get("id")
    if not list_id:
        return {"status": "error", "message": "list_id is required."}
    conn = get_connection()
    row = conn.execute(
        "SELECT id, name FROM user_lists WHERE id=? AND user_id=?",
        (list_id, user_id),
    ).fetchone()
    if not row:
        conn.close()
        return {"status": "not_found", "message": "List not found."}
    item_count_row = conn.execute(
        "SELECT COUNT(*) AS c FROM list_items WHERE list_id=? AND user_id=?",
        (list_id, user_id),
    ).fetchone()
    item_count = item_count_row["c"] if isinstance(item_count_row, dict) else item_count_row[0]
    conn.close()
    delete_row("list_items", {"list_id": list_id, "user_id": user_id})
    delete_row("user_lists", {"id": list_id, "user_id": user_id})
    name = row["name"] if not isinstance(row, dict) else row.get("name")
    return {"status": "ok", "deleted": name, "id": list_id, "items_removed": item_count}
def _check_grocery_item(args: dict, user_id: str) -> dict:
    """Mark a grocery item as checked. Reads the canonical "Grocery"
    user_list first (what the UI shows); falls back to the legacy
    grocery_items table if nothing matches there."""
    name = args["item_name"].lower()
    conn = get_connection()
    try:
        glist = conn.execute(
            "SELECT id FROM user_lists WHERE user_id=? AND LOWER(name)='grocery' "
            "ORDER BY created_at ASC LIMIT 1",
            (user_id,),
        ).fetchone()
        if glist:
            list_id = glist["id"] if isinstance(glist, dict) else glist[0]
            rows = conn.execute(
                "SELECT id, name FROM list_items "
                "WHERE list_id=? AND user_id=? AND is_checked=0",
                (list_id, user_id),
            ).fetchall()
            matched = next((r for r in rows if name in r["name"].lower()), None)
            if matched:
                conn.close()
                update_row("list_items", {"is_checked": 1}, {"id": matched["id"]})
                return {"status": "ok", "checked": matched["name"]}
        # Legacy fallback for pre-migration items.
        legacy_rows = conn.execute(
            "SELECT id, name FROM grocery_items WHERE user_id=? AND is_checked=0",
            (user_id,),
        ).fetchall()
    finally:
        conn.close()
    matched = next((r for r in legacy_rows if name in r["name"].lower()), None)
    if matched:
        update_row("grocery_items", {"is_checked": 1}, {"id": matched["id"]})
        return {"status": "ok", "checked": matched["name"]}
    return {"status": "not_found", "searched": args["item_name"]}
def _get_grocery_list(args: dict, user_id: str) -> dict:
    """Return the unchecked grocery items as the user sees them in the Lists
    tab. Prefers the "Grocery" user_list; falls back to the legacy table."""
    conn = get_connection()
    try:
        glist = conn.execute(
            "SELECT id FROM user_lists WHERE user_id=? AND LOWER(name)='grocery' "
            "ORDER BY created_at ASC LIMIT 1",
            (user_id,),
        ).fetchone()
        if glist:
            list_id = glist["id"] if isinstance(glist, dict) else glist[0]
            rows = conn.execute(
                "SELECT name FROM list_items "
                "WHERE list_id=? AND user_id=? AND is_checked=0 "
                "ORDER BY sort_order ASC",
                (list_id, user_id),
            ).fetchall()
            names = [r["name"] if isinstance(r, dict) else r[0] for r in rows]
            if names:
                return {"status": "ok", "items": names, "count": len(names)}
    finally:
        conn.close()
    items = fetch_rows("grocery_items", {"user_id": user_id, "is_checked": 0})
    names = [i["name"] for i in items]
    return {"status": "ok", "items": names, "count": len(names)}
def _create_list(args: dict, user_id: str) -> dict:
    name = args["name"]
    color = args.get("color", "#ffffff")
    initial_items = args.get("items", [])
    list_id = _uid()
    now = _now_iso()
    conn = get_connection()
    row = conn.execute(
        "SELECT COALESCE(MAX(sort_order),0) as val FROM user_lists WHERE user_id=?",
        (user_id,),
    ).fetchone()
    max_order = row["val"] if isinstance(row, dict) else row[0]
    conn.close()
    insert_row("user_lists", {
        "id": list_id,
        "user_id": user_id,
        "name": name,
        "icon": "",
        "color": color,
        "sort_order": max_order + 1,
        "created_at": now,
    })
    added = []
    for i, item_name in enumerate(initial_items):
        insert_row("list_items", {
            "id": _uid(),
            "list_id": list_id,
            "user_id": user_id,
            "name": item_name,
            "notes": "",
            "is_checked": 0,
            "sort_order": i + 1,
            "added_at": now,
        })
        added.append(item_name)
    result = {"status": "ok", "id": list_id, "name": name, "color": color}
    if added:
        result["items_added"] = added
        result["item_count"] = len(added)
    return result
def _add_list_items(args: dict, user_id: str) -> dict:
    list_id = args["list_id"]
    items = args.get("items", [])
    added = []
    conn = get_connection()
    row = conn.execute(
        "SELECT COALESCE(MAX(sort_order),0) as val FROM list_items WHERE list_id=?",
        (list_id,),
    ).fetchone()
    max_order = row["val"] if isinstance(row, dict) else row[0]
    conn.close()
    for i, name in enumerate(items):
        insert_row("list_items", {
            "id": _uid(),
            "list_id": list_id,
            "user_id": user_id,
            "name": name,
            "notes": "",
            "is_checked": 0,
            "sort_order": max_order + 1 + i,
            "added_at": _now_iso(),
        })
        added.append(name)
    return {
        "status": "ok",
        "list_id": list_id,
        "added": added,
        "count_added": len(added),
    }
def _get_user_lists(args: dict, user_id: str) -> dict:
    conn = get_connection()
    lists = conn.execute(
        "SELECT * FROM user_lists WHERE user_id=? ORDER BY sort_order ASC, created_at ASC",
        (user_id,),
    ).fetchall()
    result = []
    for lst in lists:
        d = dict(lst)
        ic_row = conn.execute(
            "SELECT COUNT(*) as cnt FROM list_items WHERE list_id=? AND is_checked=0",
            (d["id"],),
        ).fetchone()
        item_count = ic_row["cnt"] if isinstance(ic_row, dict) else ic_row[0]
        result.append({"id": d["id"], "name": d["name"], "item_count": item_count})
    conn.close()
    return {"status": "ok", "lists": result, "count": len(result)}
