"""Grocery list — single built-in Grocery list in user_lists / list_items."""
from __future__ import annotations

from core.grocery_list import (
    GROCERY_LIST_NAME,
    ensure_grocery_list_ready,
    get_unchecked_grocery_item_names,
    grocery_list_sort_key,
)
from core.tools.handlers.lists import (
    _add_grocery_items,
    _check_grocery_item,
    _create_list,
    _delete_grocery_items,
    _delete_list,
    _uncheck_grocery_item,
)
from core.tools.shared import _now_iso, _uid
from db import get_connection, insert_row
from db.auth import get_or_create_user_by_email


def _reset_user(uid: str) -> None:
    conn = get_connection()
    conn.execute("DELETE FROM list_items WHERE user_id=?", (uid,))
    conn.execute("DELETE FROM user_lists WHERE user_id=?", (uid,))
    conn.commit()
    conn.close()


def test_create_list_named_grocery_does_not_duplicate():
    user = get_or_create_user_by_email("pytest-grocery-dedupe@test.app")
    uid = user["id"]
    _reset_user(uid)

    ensure_grocery_list_ready(uid)
    result = _create_list({"name": "Grocery", "items": ["bread"]}, uid)

    conn = get_connection()
    lists = conn.execute(
        "SELECT id, name FROM user_lists WHERE user_id=? ORDER BY created_at ASC",
        (uid,),
    ).fetchall()
    conn.close()

    assert len(lists) == 1
    assert result["items_added"] == ["bread"]
    assert get_unchecked_grocery_item_names(uid) == ["bread"]


def test_add_grocery_items_visible_to_lists_tab():
    user = get_or_create_user_by_email("pytest-grocery-add-ui@test.app")
    uid = user["id"]
    _reset_user(uid)

    _add_grocery_items({"items": [{"name": "eggs"}, {"name": "butter"}]}, uid)
    list_id = ensure_grocery_list_ready(uid)

    conn = get_connection()
    rows = conn.execute(
        "SELECT name FROM list_items WHERE list_id=? AND user_id=? AND is_checked=0 "
        "ORDER BY sort_order ASC",
        (list_id, uid),
    ).fetchall()
    conn.close()

    assert [r["name"] if isinstance(r, dict) else r[0] for r in rows] == ["eggs", "butter"]
    assert get_unchecked_grocery_item_names(uid) == ["eggs", "butter"]


def test_duplicate_grocery_lists_merge():
    user = get_or_create_user_by_email("pytest-grocery-merge@test.app")
    uid = user["id"]
    _reset_user(uid)

    now = _now_iso()
    first_id = _uid()
    second_id = _uid()
    insert_row(
        "user_lists",
        {
            "id": first_id,
            "user_id": uid,
            "name": "Grocery",
            "icon": "",
            "color": "#fff",
            "sort_order": 0,
            "created_at": "2020-01-01",
        },
    )
    insert_row(
        "user_lists",
        {
            "id": second_id,
            "user_id": uid,
            "name": "Grocery",
            "icon": "",
            "color": "#fff",
            "sort_order": 1,
            "created_at": "2021-01-01",
        },
    )
    insert_row(
        "list_items",
        {
            "id": _uid(),
            "list_id": first_id,
            "user_id": uid,
            "name": "milk",
            "notes": "",
            "is_checked": 0,
            "sort_order": 1,
            "added_at": now,
        },
    )
    insert_row(
        "list_items",
        {
            "id": _uid(),
            "list_id": second_id,
            "user_id": uid,
            "name": "eggs",
            "notes": "",
            "is_checked": 0,
            "sort_order": 1,
            "added_at": now,
        },
    )

    canonical_id = ensure_grocery_list_ready(uid)

    conn = get_connection()
    lists = conn.execute(
        "SELECT id, name, sort_order FROM user_lists WHERE user_id=?", (uid,)
    ).fetchall()
    items = conn.execute(
        "SELECT name FROM list_items WHERE list_id=? ORDER BY name ASC",
        (canonical_id,),
    ).fetchall()
    conn.close()

    assert len(lists) == 1
    assert lists[0]["name"] == GROCERY_LIST_NAME
    assert int(lists[0]["sort_order"]) == 0
    assert [r["name"] if isinstance(r, dict) else r[0] for r in items] == ["eggs", "milk"]


def test_grocery_list_sorts_first():
    rows = [
        {"name": "Packing", "sort_order": 0, "created_at": "2020-01-01"},
        {"name": "Grocery", "sort_order": 3, "created_at": "2021-01-01"},
    ]
    assert grocery_list_sort_key(rows[0]) > grocery_list_sort_key(rows[1])


def test_delete_grocery_items_removes_from_list():
    user = get_or_create_user_by_email("pytest-grocery-delete-item@test.app")
    uid = user["id"]
    _reset_user(uid)

    _add_grocery_items({"items": [{"name": "milk"}, {"name": "eggs"}, {"name": "bread"}]}, uid)
    result = _delete_grocery_items({"item_names": ["milk", "bread"]}, uid)

    assert result["status"] == "ok"
    assert result["removed"] == ["milk", "bread"]
    assert result["count_removed"] == 2
    assert get_unchecked_grocery_item_names(uid) == ["eggs"]


def test_add_grocery_items_stores_quantity_in_notes():
    user = get_or_create_user_by_email("pytest-grocery-qty@test.app")
    uid = user["id"]
    _reset_user(uid)

    _add_grocery_items({"items": [{"name": "milk", "quantity": "2 gallons"}]}, uid)
    list_id = ensure_grocery_list_ready(uid)

    conn = get_connection()
    row = conn.execute(
        "SELECT name, notes FROM list_items WHERE list_id=? AND user_id=?",
        (list_id, uid),
    ).fetchone()
    conn.close()

    assert row["name"] == "milk"
    assert row["notes"] == "2 gallons"
    assert get_unchecked_grocery_item_names(uid) == ["milk (2 gallons)"]


def test_check_grocery_item_requires_name():
    user = get_or_create_user_by_email("pytest-grocery-check-miss@test.app")
    uid = user["id"]
    _reset_user(uid)

    result = _check_grocery_item({}, uid)
    assert result["status"] == "error"


def test_delete_grocery_items_not_found():
    user = get_or_create_user_by_email("pytest-grocery-delete-miss@test.app")
    uid = user["id"]
    _reset_user(uid)

    _add_grocery_items({"items": [{"name": "butter"}]}, uid)
    result = _delete_grocery_items({"item_names": ["yogurt"]}, uid)

    assert result["status"] == "not_found"
    assert result["removed"] == []
    assert get_unchecked_grocery_item_names(uid) == ["butter"]


def test_grocery_item_match_requires_exact_name():
    user = get_or_create_user_by_email("pytest-grocery-exact-match@test.app")
    uid = user["id"]
    _reset_user(uid)

    _add_grocery_items({"items": [{"name": "milk"}, {"name": "almond milk"}]}, uid)
    result = _delete_grocery_items({"item_names": ["milk"]}, uid)

    assert result["status"] == "ok"
    assert result["removed"] == ["milk"]
    assert get_unchecked_grocery_item_names(uid) == ["almond milk"]


def test_add_grocery_items_stores_estimated_price_in_notes():
    user = get_or_create_user_by_email("pytest-grocery-price@test.app")
    uid = user["id"]
    _reset_user(uid)

    _add_grocery_items(
        {"items": [{"name": "eggs", "quantity": "1 dozen", "estimated_price": 4.5}]},
        uid,
    )
    list_id = ensure_grocery_list_ready(uid)

    conn = get_connection()
    row = conn.execute(
        "SELECT name, notes FROM list_items WHERE list_id=? AND user_id=?",
        (list_id, uid),
    ).fetchone()
    conn.close()

    assert row["notes"] == "1 dozen · est $4.50"
    assert get_unchecked_grocery_item_names(uid) == ["eggs (1 dozen · est $4.50)"]


def test_delete_grocery_items_removes_checked_items():
    user = get_or_create_user_by_email("pytest-grocery-delete-checked@test.app")
    uid = user["id"]
    _reset_user(uid)

    _add_grocery_items({"items": [{"name": "milk"}]}, uid)
    _check_grocery_item({"item_name": "milk"}, uid)
    result = _delete_grocery_items({"item_names": ["milk"]}, uid)

    assert result["status"] == "ok"
    assert result["removed"] == ["milk"]
    assert get_unchecked_grocery_item_names(uid) == []


def test_uncheck_grocery_item_restores_unchecked():
    user = get_or_create_user_by_email("pytest-grocery-uncheck@test.app")
    uid = user["id"]
    _reset_user(uid)

    _add_grocery_items({"items": [{"name": "bread"}]}, uid)
    _check_grocery_item({"item_name": "bread"}, uid)
    assert get_unchecked_grocery_item_names(uid) == []

    result = _uncheck_grocery_item({"item_name": "bread"}, uid)
    assert result["status"] == "ok"
    assert get_unchecked_grocery_item_names(uid) == ["bread"]


def test_delete_list_blocks_builtin_grocery():
    user = get_or_create_user_by_email("pytest-grocery-nodelete@test.app")
    uid = user["id"]
    _reset_user(uid)
    list_id = ensure_grocery_list_ready(uid)

    result = _delete_list({"list_id": list_id}, uid)
    assert result["status"] == "error"
