"""Tool handlers — lists."""
from __future__ import annotations

from db import (
    delete_row,
    fetch_rows,
    get_connection,
    insert_row,
    update_row,
)
from core.grocery_list import (
    GROCERY_LIST_NAME,
    ensure_grocery_list_ready,
    get_unchecked_grocery_item_names,
    grocery_list_sort_key,
    is_builtin_grocery_list,
    is_grocery_list_name,
)
from core.tools.shared import (
    _now_iso,
    _uid
)


def _match_unchecked_grocery_item(rows, query: str):
    """First unchecked row whose name contains query (case-insensitive)."""
    needle = str(query or "").strip().lower()
    if not needle:
        return None
    for row in rows:
        name = row["name"] if isinstance(row, dict) else row[1]
        if needle in str(name).lower():
            return row
    return None


def _row_id(row) -> str:
    return row["id"] if isinstance(row, dict) else row[0]


def _row_name(row) -> str:
    return row["name"] if isinstance(row, dict) else row[1]


def _add_grocery_items(args: dict, user_id: str) -> dict:
    """Add items to the user's Grocery list (the Lists tab source of truth)."""
    raw_items = args.get("items", []) or []
    if not raw_items:
        return {"status": "ok", "added": [], "count_added": 0}

    list_id = ensure_grocery_list_ready(user_id)
    now = _now_iso()

    conn = get_connection()
    order_row = conn.execute(
        "SELECT COALESCE(MAX(sort_order),0) AS val FROM list_items WHERE list_id=?",
        (list_id,),
    ).fetchone()
    max_item_order = order_row["val"] if isinstance(order_row, dict) else order_row[0]
    conn.close()

    items_added: list[str] = []
    total_est = 0.0
    for i, item in enumerate(raw_items):
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        quantity = str(item.get("quantity") or "").strip()
        notes = quantity
        try:
            price = float(item.get("estimated_price", 0) or 0)
        except (TypeError, ValueError):
            price = 0.0
        total_est += price

        insert_row("list_items", {
            "id": _uid(),
            "list_id": list_id,
            "user_id": user_id,
            "name": name,
            "notes": notes,
            "is_checked": 0,
            "sort_order": max_item_order + 1 + i,
            "added_at": now,
        })
        items_added.append(f"{name} ({quantity})" if quantity else name)

    all_items = fetch_rows("list_items", {"list_id": list_id, "user_id": user_id, "is_checked": 0})
    return {
        "status": "ok",
        "list_id": list_id,
        "list_name": GROCERY_LIST_NAME,
        "added": items_added,
        "count_added": len(items_added),
        "total_list_count": len(all_items),
        "estimated_total_added": total_est,
    }


def _delete_grocery_items(args: dict, user_id: str) -> dict:
    """Remove items from the user's Grocery list (unchecked items only)."""
    raw_names = list(args.get("item_names") or [])
    single = str(args.get("item_name") or "").strip()
    if single:
        raw_names.insert(0, single)
    names = [str(n).strip() for n in raw_names if str(n).strip()]
    if not names:
        return {"status": "error", "message": "item_names is required."}

    list_id = ensure_grocery_list_ready(user_id)
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT id, name FROM list_items "
            "WHERE list_id=? AND user_id=? AND is_checked=0",
            (list_id, user_id),
        ).fetchall()
        remaining = list(rows)
        removed: list[str] = []
        not_found: list[str] = []
        for query in names:
            matched = _match_unchecked_grocery_item(remaining, query)
            if not matched:
                not_found.append(query)
                continue
            item_id = _row_id(matched)
            delete_row("list_items", {"id": item_id, "user_id": user_id})
            removed.append(_row_name(matched))
            remaining = [row for row in remaining if _row_id(row) != item_id]
    finally:
        conn.close()

    result = {
        "status": "ok",
        "list_id": list_id,
        "list_name": GROCERY_LIST_NAME,
        "removed": removed,
        "count_removed": len(removed),
        "not_found": not_found,
        "total_list_count": len(get_unchecked_grocery_item_names(user_id)),
    }
    if not removed and not_found:
        result["status"] = "not_found"
    return result


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
    name = row["name"] if isinstance(row, dict) else row[1]
    if is_builtin_grocery_list(user_id, list_id):
        conn.close()
        return {
            "status": "error",
            "message": "The Grocery list is built in and can't be deleted. Clear its items instead.",
        }
    item_count_row = conn.execute(
        "SELECT COUNT(*) AS c FROM list_items WHERE list_id=? AND user_id=?",
        (list_id, user_id),
    ).fetchone()
    item_count = item_count_row["c"] if isinstance(item_count_row, dict) else item_count_row[0]
    conn.close()
    delete_row("list_items", {"list_id": list_id, "user_id": user_id})
    delete_row("user_lists", {"id": list_id, "user_id": user_id})
    return {"status": "ok", "deleted": name, "id": list_id, "items_removed": item_count}
def _check_grocery_item(args: dict, user_id: str) -> dict:
    """Mark a grocery item as checked on the canonical Grocery list."""
    item_name = str(args.get("item_name") or "").strip()
    if not item_name:
        return {"status": "error", "message": "item_name is required."}
    name = item_name.lower()
    list_id = ensure_grocery_list_ready(user_id)
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT id, name FROM list_items "
            "WHERE list_id=? AND user_id=? AND is_checked=0",
            (list_id, user_id),
        ).fetchall()
        matched = _match_unchecked_grocery_item(rows, name)
        if matched:
            update_row("list_items", {"is_checked": 1}, {"id": _row_id(matched)})
            return {"status": "ok", "checked": _row_name(matched)}
    finally:
        conn.close()
    return {"status": "not_found", "searched": item_name}


def _get_grocery_list(args: dict, user_id: str) -> dict:
    """Return unchecked grocery items exactly as the Lists tab shows them."""
    names = get_unchecked_grocery_item_names(user_id)
    return {"status": "ok", "items": names, "count": len(names)}
def _create_list(args: dict, user_id: str) -> dict:
    name = args["name"]
    color = args.get("color", "#ffffff")
    initial_items = args.get("items", [])
    if is_grocery_list_name(name):
        if initial_items:
            added_result = _add_grocery_items(
                {"items": [{"name": n} for n in initial_items]},
                user_id,
            )
            return {
                "status": "ok",
                "id": added_result.get("list_id"),
                "name": GROCERY_LIST_NAME,
                "color": color,
                "items_added": added_result.get("added", []),
                "item_count": added_result.get("count_added", 0),
            }
        list_id = ensure_grocery_list_ready(user_id)
        return {"status": "ok", "id": list_id, "name": GROCERY_LIST_NAME, "color": color}
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
    if is_builtin_grocery_list(user_id, list_id):
        return _add_grocery_items(
            {"items": [{"name": str(n)} for n in items if str(n).strip()]},
            user_id,
        )
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
    grocery_list_id = ensure_grocery_list_ready(user_id)
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
        name = GROCERY_LIST_NAME if d["id"] == grocery_list_id else d["name"]
        result.append({"id": d["id"], "name": name, "item_count": item_count})
    conn.close()
    result.sort(key=grocery_list_sort_key)
    return {
        "status": "ok",
        "lists": result,
        "count": len(result),
        "grocery_list_id": grocery_list_id,
        "grocery_list_name": GROCERY_LIST_NAME,
    }
