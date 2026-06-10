"""Shared grocery list (single built-in Grocery list in user_lists / list_items)."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from db.connection import get_connection
from db.crud import insert_row, update_row

GROCERY_LIST_NAME = "Grocery"
GROCERY_LIST_COLOR = "#22c55e"


def is_grocery_list_name(name: str) -> bool:
    return str(name or "").strip().lower() == GROCERY_LIST_NAME.lower()


def is_builtin_grocery_list(user_id: str, list_id: str) -> bool:
    """True when list_id refers to the built-in Grocery list."""
    canonical_id = consolidate_grocery_lists(user_id)
    if canonical_id and list_id == canonical_id:
        return True

    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT name FROM user_lists WHERE id=? AND user_id=?",
            (list_id, user_id),
        ).fetchone()
    finally:
        conn.close()
    if not row:
        return False
    return is_grocery_list_name(str(_row_val(row, "name", 0)))


def get_canonical_grocery_list_id(user_id: str) -> str:
    """Canonical Grocery list id for read APIs (merge duplicates, no absorb/migrate)."""
    existing = consolidate_grocery_lists(user_id)
    if existing:
        return existing
    return get_or_create_grocery_list_id(user_id)


def resolve_list_items_list_id(user_id: str, list_id: str, *, write: bool = False) -> str:
    if is_builtin_grocery_list(user_id, list_id):
        if write:
            return ensure_grocery_list_ready(user_id)
        return get_canonical_grocery_list_id(user_id)
    return list_id


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _row_val(row, key: str = "id", index: int = 0):
    if isinstance(row, dict):
        return row[key]
    return row[index]


def _dedupe_unchecked_items(conn, list_id: str, user_id: str) -> None:
    rows = conn.execute(
        "SELECT id, name FROM list_items "
        "WHERE list_id=? AND user_id=? AND is_checked=0 "
        "ORDER BY sort_order ASC, added_at ASC",
        (list_id, user_id),
    ).fetchall()
    seen: set[str] = set()
    for row in rows:
        item_id = _row_val(row)
        name_key = str(_row_val(row, "name", 1)).lower()
        if name_key in seen:
            conn.execute(
                "DELETE FROM list_items WHERE id=? AND user_id=?",
                (item_id, user_id),
            )
        else:
            seen.add(name_key)


def _normalize_canonical_grocery_list(conn, user_id: str, list_id: str) -> None:
    row = conn.execute(
        "SELECT name, sort_order FROM user_lists WHERE id=? AND user_id=?",
        (list_id, user_id),
    ).fetchone()
    if not row:
        return

    name = str(_row_val(row, "name", 0))
    sort_order = int(_row_val(row, "sort_order", 1) or 0)
    updates: dict = {}
    if name != GROCERY_LIST_NAME:
        updates["name"] = GROCERY_LIST_NAME
    if sort_order != 0:
        updates["sort_order"] = 0
    if updates:
        update_row("user_lists", updates, {"id": list_id, "user_id": user_id})

    _dedupe_unchecked_items(conn, list_id, user_id)
    conn.commit()


def _absorb_misnamed_grocery_lists(conn, user_id: str, canonical_id: str) -> None:
    """Fold stray groc*-prefixed list rows into the canonical list, then drop them."""
    rows = conn.execute(
        "SELECT id FROM user_lists WHERE user_id=? AND id!=? "
        "AND LOWER(TRIM(name)) LIKE ? AND LOWER(TRIM(name))!=?",
        (user_id, canonical_id, "groc%", GROCERY_LIST_NAME.lower()),
    ).fetchall()
    for row in rows:
        other_id = _row_val(row)
        conn.execute(
            "UPDATE list_items SET list_id=? WHERE list_id=? AND user_id=?",
            (canonical_id, other_id, user_id),
        )
        conn.execute(
            "DELETE FROM user_lists WHERE id=? AND user_id=?",
            (other_id, user_id),
        )


def consolidate_grocery_lists(user_id: str) -> str | None:
    """Merge duplicate Grocery lists into one row. Returns canonical id."""
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT id FROM user_lists WHERE user_id=? AND LOWER(TRIM(name))=? "
            "ORDER BY created_at ASC",
            (user_id, GROCERY_LIST_NAME.lower()),
        ).fetchall()
        if not rows:
            return None

        canonical_id = _row_val(rows[0])
        for dup in rows[1:]:
            dup_id = _row_val(dup)
            conn.execute(
                "UPDATE list_items SET list_id=? WHERE list_id=? AND user_id=?",
                (canonical_id, dup_id, user_id),
            )
            conn.execute(
                "DELETE FROM user_lists WHERE id=? AND user_id=?",
                (dup_id, user_id),
            )

        _absorb_misnamed_grocery_lists(conn, user_id, canonical_id)
        _normalize_canonical_grocery_list(conn, user_id, canonical_id)
        return canonical_id
    finally:
        conn.close()


def get_or_create_grocery_list_id(user_id: str) -> str:
    existing = consolidate_grocery_lists(user_id)
    if existing:
        return existing

    list_id = str(uuid.uuid4())
    insert_row(
        "user_lists",
        {
            "id": list_id,
            "user_id": user_id,
            "name": GROCERY_LIST_NAME,
            "icon": "",
            "color": GROCERY_LIST_COLOR,
            "sort_order": 0,
            "created_at": _now_iso(),
        },
    )
    return list_id


def ensure_grocery_list_ready(user_id: str) -> str:
    list_id = get_or_create_grocery_list_id(user_id)
    conn = get_connection()
    try:
        _absorb_misnamed_grocery_lists(conn, user_id, list_id)
        _normalize_canonical_grocery_list(conn, user_id, list_id)
        conn.commit()
    finally:
        conn.close()
    return list_id


def grocery_list_sort_key(list_row: dict) -> tuple:
    name = str(list_row.get("name", ""))
    return (
        0 if is_grocery_list_name(name) else 1,
        int(list_row.get("sort_order", 0) or 0),
        str(list_row.get("created_at", "")),
    )


def format_grocery_item_notes(quantity: str = "", estimated_price: float = 0.0) -> str:
    """Build list_items.notes from optional quantity and estimated price."""
    parts: list[str] = []
    q = str(quantity or "").strip()
    if q:
        parts.append(q)
    if estimated_price and estimated_price > 0:
        parts.append(f"est ${estimated_price:.2f}")
    return " · ".join(parts)


def format_list_item_label(name: str, notes: str = "") -> str:
    """Display label for list items; appends notes (e.g. quantity) when present."""
    label = str(name or "").strip()
    extra = str(notes or "").strip()
    if extra:
        return f"{label} ({extra})"
    return label


def _item_field(row, field: str, index: int) -> str:
    if isinstance(row, dict):
        return str(row.get(field, "") or "")
    return str(row[index] if len(row) > index else "")


def resolve_grocery_item_row(rows, query: str):
    """Match by exact item name or full display label (case-insensitive)."""
    needle = str(query or "").strip().lower()
    if not needle:
        return None
    for row in rows:
        if _item_field(row, "name", 1).strip().lower() == needle:
            return row
    for row in rows:
        label = format_list_item_label(
            _item_field(row, "name", 1),
            _item_field(row, "notes", 2),
        ).lower()
        if label == needle:
            return row
    return None


def get_unchecked_grocery_item_names(user_id: str) -> list[str]:
    list_id = ensure_grocery_list_ready(user_id)
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT name, notes FROM list_items "
            "WHERE list_id=? AND user_id=? AND is_checked=0 "
            "ORDER BY sort_order ASC, added_at ASC",
            (list_id, user_id),
        ).fetchall()
        return [
            format_list_item_label(_row_val(r, "name", 0), _row_val(r, "notes", 1))
            for r in rows
        ]
    finally:
        conn.close()
