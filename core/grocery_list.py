"""Shared grocery list reads (user_lists + legacy grocery_items fallback)."""
from __future__ import annotations

from db.connection import get_connection
from db.crud import fetch_rows


def get_unchecked_grocery_item_names(user_id: str) -> list[str]:
    """Return unchecked grocery item names; prefers the Grocery user_list."""
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
                return names
    finally:
        conn.close()
    items = fetch_rows("grocery_items", {"user_id": user_id, "is_checked": 0})
    return [i["name"] for i in items]
