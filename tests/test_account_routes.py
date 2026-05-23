"""HTTP tests for Phase 2c account router extraction (no live xAI receipt calls)."""
from __future__ import annotations

import io

import pytest
from httpx import ASGITransport, AsyncClient

from backend.auth import create_token
from backend.deps import resolve_plan_for_user
from backend.main import app
from db import get_or_create_user_by_email

_DEV_ORIGIN = "http://localhost:3000"


@pytest.fixture
def auth_headers():
    user = get_or_create_user_by_email("pytest-account@orryon.app")
    token = create_token(user["id"], user["email"], device_name="pytest", ip_address="127.0.0.1")
    return {
        "Authorization": f"Bearer {token}",
        "Origin": _DEV_ORIGIN,
    }


@pytest.mark.asyncio
async def test_settings_requires_auth():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/settings")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_settings_with_auth(auth_headers):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/settings", headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    assert "email" in body
    assert "grok_model" in body
    assert "smtp_enabled" in body


@pytest.mark.asyncio
async def test_settings_patch_empty_rejected(auth_headers):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.patch("/api/settings", headers=auth_headers, json={})
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_preferences_with_auth(auth_headers):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/preferences", headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    assert "life_priorities" in body
    assert isinstance(body["life_priorities"], list)
    assert "onboarding_complete" in body


@pytest.mark.asyncio
async def test_chat_usage_with_auth(auth_headers):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/chat/usage", headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    assert "messages_used" in body
    assert "plan" in body
    assert "usage_resets_label" in body


@pytest.mark.asyncio
async def test_share_public_invalid_token():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/share/not-a-real-token")
    assert res.status_code == 404
    assert "detail" in res.json()


@pytest.mark.asyncio
async def test_email_change_send_invalid(auth_headers):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/api/settings/email-change/send-code",
            headers=auth_headers,
            json={"new_email": "not-an-email"},
        )
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_receipt_scan_unsupported_mime(auth_headers):
    transport = ASGITransport(app=app)
    files = {"file": ("x.txt", io.BytesIO(b"hello"), "text/plain")}
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/api/receipts/scan",
            headers=auth_headers,
            files=files,
        )
    assert res.status_code == 415


@pytest.mark.asyncio
async def test_receipt_scan_empty_upload(auth_headers):
    transport = ASGITransport(app=app)
    files = {"file": ("x.jpg", io.BytesIO(b""), "image/jpeg")}
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/api/receipts/scan",
            headers=auth_headers,
            files=files,
        )
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_export_when_plan_active(auth_headers):
    """Trial users have is_active_pro — export should succeed without calling xAI."""
    user = get_or_create_user_by_email("pytest-account@orryon.app")
    plan = resolve_plan_for_user(user["id"])
    assert plan["is_active_pro"] is True

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/export", headers=auth_headers)
    assert res.status_code == 200
    assert res.headers.get("content-type", "").startswith("application/zip")
    assert len(res.content) > 100


def test_account_routes_split_across_routers():
    from backend.routers import account_data, account_settings, receipts as receipts_mod

    settings_paths = {getattr(r, "path", "") for r in account_settings.router.routes}
    data_paths = {getattr(r, "path", "") for r in account_data.router.routes}
    receipt_paths = {getattr(r, "path", "") for r in receipts_mod.router.routes}

    assert "/api/settings" in settings_paths
    assert "/api/preferences" in settings_paths
    assert "/api/chat/usage" in settings_paths
    assert "/api/export" in data_paths
    assert "/api/share/{token}" in data_paths
    assert "/api/receipts/scan" in receipt_paths

    assert "/api/settings" not in data_paths
    assert "/api/export" not in settings_paths
    assert "/api/receipts/scan" not in settings_paths
