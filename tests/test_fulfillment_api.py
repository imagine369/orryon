"""HTTP API tests for fulfillment handoffs."""
from __future__ import annotations

from starlette.testclient import TestClient

from backend.auth import create_token
from backend.main import app
from core.tools import execute_tool
from db.auth import get_or_create_user_by_email

_DEV_ORIGIN = "http://localhost:3000"


def _headers(email: str) -> dict[str, str]:
    user = get_or_create_user_by_email(email)
    token = create_token(user["id"], user["email"], device_name="pytest", ip_address="127.0.0.1")
    return {"Authorization": f"Bearer {token}", "Origin": _DEV_ORIGIN}


def test_fulfillment_handoffs_list_create_dismiss():
    headers = _headers("pytest-fulfillment-api@orryon.app")
    user = get_or_create_user_by_email("pytest-fulfillment-api@orryon.app")
    uid = user["id"]

    with TestClient(app) as client:
        list_res = client.get("/api/fulfillment/handoffs", headers=headers)
        assert list_res.status_code == 200
        assert list_res.json()["enabled"] is True

        tool_res, tabs = execute_tool(
            "create_fulfillment_handoff",
            {"handoffs": [{"type": "grocery", "title": "API pytest grocery"}]},
            uid,
        )
        assert tool_res["status"] == "ok"
        assert tabs == ["errands"]

        handoffs = client.get("/api/fulfillment/handoffs", headers=headers).json()["handoffs"]
        assert any(h["title"] == "API pytest grocery" for h in handoffs)

        handoff_id = next(h["id"] for h in handoffs if h["title"] == "API pytest grocery")
        dismiss_res = client.post(f"/api/fulfillment/handoffs/{handoff_id}/dismiss", headers=headers)
        assert dismiss_res.status_code == 200

        again = client.post(f"/api/fulfillment/handoffs/{handoff_id}/dismiss", headers=headers)
        assert again.status_code == 404

        missing = client.post(
            "/api/fulfillment/handoffs/00000000-0000-0000-0000-000000000000/dismiss",
            headers=headers,
        )
        assert missing.status_code == 404


def test_fulfillment_demo_seed_local_dev():
    headers = _headers("pytest-fulfillment-api-seed@orryon.app")
    with TestClient(app) as client:
        res = client.post("/api/fulfillment/demo/seed", headers=headers)
        assert res.status_code == 200
        body = res.json()
        assert body["count"] >= 4
        assert len(body["handoffs"]) >= 4


def test_fulfillment_requires_auth():
    with TestClient(app) as client:
        assert client.get("/api/fulfillment/handoffs").status_code in (401, 403)
