"""HTTP tests for Phase 2c account router extraction."""
from __future__ import annotations

import io
import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from backend.auth import create_token
from backend.deps import IS_LOCAL_DEV, resolve_plan_for_user
from backend.main import app
from db import get_connection
from db.auth import get_or_create_user_by_email

_DEV_ORIGIN = "http://localhost:3000"


def _headers_for_email(email: str) -> dict[str, str]:
    user = get_or_create_user_by_email(email)
    token = create_token(user["id"], user["email"], device_name="pytest", ip_address="127.0.0.1")
    return {
        "Authorization": f"Bearer {token}",
        "Origin": _DEV_ORIGIN,
    }


@pytest.fixture
def auth_headers():
    return _headers_for_email("pytest-account@orryon.app")


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
    assert "billing_enabled" in body
    assert "xai_key_set" in body


@pytest.mark.asyncio
async def test_xai_key_save_and_mask(auth_headers):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/api/settings/xai-key",
            headers=auth_headers,
            json={"api_key": "xai-abcdefghijklmnopqrstuvwx"},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["xai_key_set"] is True
        assert body["xai_key_masked"].endswith("uvwx")
        assert "abcdefghijklmnopqrstuvwx" not in body["xai_key_masked"]
        settings = await client.get("/api/settings", headers=auth_headers)
        assert settings.json()["xai_key_set"] is True
        assert "abcdefghijklmnopqrstuvwx" not in settings.json().get("xai_key_masked", "")


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
async def test_email_change_send_and_verify(monkeypatch):
    """Full send-code → verify flow using dev_code (no real email)."""
    assert IS_LOCAL_DEV is True
    email = f"pytest-email-flow-{uuid.uuid4().hex[:8]}@orryon.app"
    new_email = f"pytest-email-flow-new-{uuid.uuid4().hex[:8]}@orryon.app"
    headers = _headers_for_email(email)

    def _noop_send(_to: str, _code: str) -> dict:
        return {"sent": False, "detail": "pytest — email not sent"}

    monkeypatch.setattr(
        "backend.routers.account_settings.send_verification_code",
        _noop_send,
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        send_res = await client.post(
            "/api/settings/email-change/send-code",
            headers=headers,
            json={"new_email": new_email},
        )
        assert send_res.status_code == 200
        send_body = send_res.json()
        code = send_body.get("dev_code", "")
        assert len(code) == 6, f"expected dev_code in local dev, got {send_body!r}"

        verify_res = await client.post(
            "/api/settings/email-change/verify",
            headers=headers,
            json={"new_email": new_email, "code": code},
        )
        assert verify_res.status_code == 200
        verify_body = verify_res.json()
        assert verify_body["email"] == new_email
        assert verify_body.get("token")

        new_headers = {
            **headers,
            "Authorization": f"Bearer {verify_body['token']}",
        }
        settings_res = await client.get("/api/settings", headers=new_headers)
        assert settings_res.status_code == 200
        assert settings_res.json()["email"] == new_email


@pytest.mark.asyncio
async def test_delete_account_removes_user():
    """Destructive — uses a dedicated user so other tests are unaffected."""
    from db import insert_row

    email = f"pytest-delete-{uuid.uuid4().hex[:12]}@orryon.app"
    headers = _headers_for_email(email)
    uid = get_or_create_user_by_email(email)["id"]

    session_id = str(uuid.uuid4())
    vital_id = str(uuid.uuid4())
    insert_row("user_preferences", {"user_id": uid, "briefing_time": "09:00"})
    insert_row("auth_sessions", {
        "id": session_id,
        "user_id": uid,
        "device_name": "pytest",
        "ip_address": "127.0.0.1",
        "created_at": "2026-06-01T00:00:00+00:00",
        "last_active": "2026-06-01T00:00:00+00:00",
        "revoked": 0,
    })
    insert_row("health_vitals", {
        "id": vital_id,
        "user_id": uid,
        "type": "weight",
        "value": 70.0,
        "recorded_at": "2026-06-01T00:00:00+00:00",
        "created_at": "2026-06-01T00:00:00+00:00",
    })

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        del_res = await client.delete("/api/account", headers=headers)
        assert del_res.status_code == 200
        assert del_res.json().get("deleted") is True

        settings_res = await client.get("/api/settings", headers=headers)
        assert settings_res.status_code == 404

    with get_connection() as conn:
        row = conn.execute("SELECT id FROM users WHERE id=?", (uid,)).fetchone()
        assert row is None
        assert conn.execute(
            "SELECT user_id FROM user_preferences WHERE user_id=?", (uid,),
        ).fetchone() is None
        assert conn.execute(
            "SELECT id FROM auth_sessions WHERE id=?", (session_id,),
        ).fetchone() is None
        assert conn.execute(
            "SELECT id FROM health_vitals WHERE id=?", (vital_id,),
        ).fetchone() is None


@pytest.mark.asyncio
async def test_receipt_scan_mocked_xai_response(monkeypatch):
    """End-to-end handler path with mocked xAI (no network)."""
    headers = _headers_for_email(f"pytest-receipt-{uuid.uuid4().hex[:8]}@orryon.app")

    receipt_json = (
        '{"merchant": "Test Mart", "amount": 19.99, "date": "2026-05-01", '
        '"category": "Groceries", "items": ["milk"]}'
    )

    class _MockResponse:
        status_code = 200
        text = ""

        def json(self):
            return {
                "choices": [{"message": {"content": receipt_json}}],
                "usage": {"prompt_tokens": 50, "completion_tokens": 30},
            }

    class _MockAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, url, **kwargs):
            assert "api.x.ai" in url
            assert kwargs.get("json", {}).get("model")
            return _MockResponse()

    monkeypatch.setattr("httpx.AsyncClient", _MockAsyncClient)

    files = {"file": ("receipt.jpg", io.BytesIO(b"\xff\xd8\xff fake jpeg"), "image/jpeg")}
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/api/receipts/scan",
            headers=headers,
            files=files,
        )
    assert res.status_code == 200
    body = res.json()
    assert body.get("merchant") == "Test Mart"
    assert body.get("amount") == 19.99
    assert body.get("category") == "Groceries"


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
