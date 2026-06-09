"""Audit log API — destructive action history."""
from __future__ import annotations

from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient

from backend.auth import create_token
from backend.main import app
from db import get_or_create_user_by_email


_DEV_ORIGIN = "http://localhost:3000"


def _headers(email: str) -> dict[str, str]:
    user = get_or_create_user_by_email(email)
    token = create_token(user["id"], user["email"], device_name="pytest", ip_address="127.0.0.1")
    return {"Authorization": f"Bearer {token}", "Origin": _DEV_ORIGIN}


@pytest.mark.asyncio
async def test_audit_history_endpoint():
    headers = _headers("pytest-audit@orryon.app")
    fake = [
        {
            "id": "a1",
            "action_type": "delete_expense",
            "description": "Agent completed delete expense",
            "status": "approved",
            "payload": {},
        }
    ]
    with patch("backend.routers.audit.get_approval_requests", return_value=fake):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.get("/api/audit/history", headers=headers)

    assert res.status_code == 200
    body = res.json()
    assert body["count"] == 1
    assert body["entries"][0]["action_type"] == "delete_expense"
    assert body["policy"]["destructive_confirmation"] == "in_chat"


@pytest.mark.asyncio
async def test_approvals_history_alias_matches_audit():
    headers = _headers("pytest-audit-alias@orryon.app")
    fake = [{"id": "a1", "status": "approved", "action_type": "delete_bill"}]
    with patch("backend.routers.audit.get_approval_requests", return_value=fake):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            audit = await client.get("/api/audit/history", headers=headers)
            legacy = await client.get("/api/approvals/history", headers=headers)

    assert audit.json()["count"] == legacy.json()["count"]
    assert legacy.json().get("deprecated")
