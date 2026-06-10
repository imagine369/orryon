"""HTTP API tests for user lists and built-in Grocery list."""
from __future__ import annotations

from starlette.testclient import TestClient

from backend.auth import create_token
from backend.main import app
from core.tools.handlers.lists import _add_grocery_items, _delete_grocery_items, _get_grocery_list
from db import get_connection
from db.auth import get_or_create_user_by_email

_DEV_ORIGIN = "http://localhost:3000"


def _headers(email: str) -> dict[str, str]:
    user = get_or_create_user_by_email(email)
    token = create_token(user["id"], user["email"], device_name="pytest", ip_address="127.0.0.1")
    return {"Authorization": f"Bearer {token}", "Origin": _DEV_ORIGIN}


def _reset_lists(uid: str) -> None:
    conn = get_connection()
    conn.execute("DELETE FROM list_items WHERE user_id=?", (uid,))
    conn.execute("DELETE FROM user_lists WHERE user_id=?", (uid,))
    conn.commit()
    conn.close()


def test_lists_api_crud_and_builtin_grocery():
    email = "pytest-lists-api@orryon.app"
    user = get_or_create_user_by_email(email)
    uid = user["id"]
    headers = _headers(email)
    _reset_lists(uid)

    with TestClient(app) as client:
        lists_res = client.get("/api/lists", headers=headers)
        assert lists_res.status_code == 200
        lists = lists_res.json()
        grocery = [row for row in lists if row.get("is_builtin")]
        assert len(grocery) == 1
        assert grocery[0]["name"] == "Grocery"

        grocery_id = grocery[0]["id"]
        blocked = client.delete(f"/api/lists/{grocery_id}", headers=headers)
        assert blocked.status_code == 400

        create_res = client.post(
            "/api/lists",
            json={"name": "Packing", "color": "#3b82f6"},
            headers=headers,
        )
        assert create_res.status_code == 200
        packing_id = create_res.json()["id"]

        add_res = client.post(
            f"/api/lists/{packing_id}/items",
            json={"name": "socks"},
            headers=headers,
        )
        assert add_res.status_code == 200
        item_id = add_res.json()["id"]

        items = client.get(f"/api/lists/{packing_id}/items", headers=headers).json()
        assert any(row["name"] == "socks" for row in items)

        check_res = client.patch(
            f"/api/list-items/{item_id}",
            json={"is_checked": 1},
            headers=headers,
        )
        assert check_res.status_code == 200

        del_item = client.delete(f"/api/list-items/{item_id}", headers=headers)
        assert del_item.status_code == 200
        assert client.get(f"/api/lists/{packing_id}/items", headers=headers).json() == []

        del_list = client.delete(f"/api/lists/{packing_id}", headers=headers)
        assert del_list.status_code == 200


def test_post_items_resolves_canonical_grocery_list_id():
    email = "pytest-lists-grocery-post@orryon.app"
    user = get_or_create_user_by_email(email)
    headers = _headers(email)
    _reset_lists(user["id"])

    with TestClient(app) as client:
        lists = client.get("/api/lists", headers=headers).json()
        grocery_id = next(row["id"] for row in lists if row.get("is_builtin"))

        add_res = client.post(
            f"/api/lists/{grocery_id}/items",
            json={"name": "bananas"},
            headers=headers,
        )
        assert add_res.status_code == 200

        names = [
            row["name"]
            for row in client.get(f"/api/lists/{grocery_id}/items", headers=headers).json()
            if not row["is_checked"]
        ]
        assert "bananas" in names


def test_get_grocery_items_uses_canonical_list():
    email = "pytest-grocery-items-endpoint@orryon.app"
    user = get_or_create_user_by_email(email)
    uid = user["id"]
    headers = _headers(email)
    _reset_lists(uid)

    _add_grocery_items({"items": [{"name": "peas"}, {"name": "potatoes"}]}, uid)

    with TestClient(app) as client:
        lists = client.get("/api/lists", headers=headers).json()
        stale_id = next(row["id"] for row in lists if row.get("is_builtin"))

        names = [
            row["name"]
            for row in client.get("/api/grocery/items", headers=headers).json()
            if not row["is_checked"]
        ]
        assert names == ["peas", "potatoes"]

        # Canonical endpoint still works if the client holds an older list id.
        via_list = [
            row["name"]
            for row in client.get(f"/api/lists/{stale_id}/items", headers=headers).json()
            if not row["is_checked"]
        ]
        assert via_list == ["peas", "potatoes"]


def test_chat_grocery_tools_match_api_list():
    email = "pytest-lists-chat-sync@orryon.app"
    user = get_or_create_user_by_email(email)
    uid = user["id"]
    _reset_lists(uid)

    _add_grocery_items(
        {"items": [{"name": "eggs"}, {"name": "milk", "quantity": "1 gal"}]},
        uid,
    )
    got = _get_grocery_list({}, uid)
    assert got["status"] == "ok"
    assert "eggs" in got["items"]
    assert "milk (1 gal)" in got["items"]

    removed = _delete_grocery_items({"item_names": ["eggs"]}, uid)
    assert removed["status"] == "ok"
    assert _get_grocery_list({}, uid)["items"] == ["milk (1 gal)"]
