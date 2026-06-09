"""HTTP tests for Phase 2b billing router extraction (no live Stripe calls)."""
from __future__ import annotations

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from backend.auth import create_token
from backend.main import app
from db.auth import get_or_create_user_by_email

_DEV_ORIGIN = "http://localhost:3000"


@pytest.fixture
def auth_headers():
    user = get_or_create_user_by_email("pytest-billing@orryon.app")
    token = create_token(user["id"], user["email"], device_name="pytest", ip_address="127.0.0.1")
    return {
        "Authorization": f"Bearer {token}",
        "Origin": _DEV_ORIGIN,
    }


@pytest.mark.asyncio
async def test_subscription_plans_public():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/subscription/plans")
    assert res.status_code == 200
    body = res.json()
    assert "plans" in body
    assert "price_id_to_plan" in body


@pytest.mark.asyncio
async def test_subscription_requires_auth():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/subscription")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_subscription_with_auth(auth_headers):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/subscription", headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    assert "plan" in body
    assert "has_stripe_subscription" in body
    assert "usage_resets_label" in body


@pytest.mark.asyncio
async def test_subscription_sync_when_stripe_disabled(auth_headers, monkeypatch):
    """Sync endpoint must 503 when Stripe is not configured (no network call)."""
    monkeypatch.setattr("config.STRIPE_ENABLED", False)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post("/api/subscription/sync", headers=auth_headers)
    assert res.status_code == 503
    assert "not configured" in res.json().get("detail", "").lower()


@pytest.mark.asyncio
async def test_stripe_webhook_rejects_missing_signature():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post("/api/stripe/webhook", content=b"{}")
    assert res.status_code == 400
    assert "signature" in res.json().get("detail", "").lower()


def test_validate_stripe_return_url_trusted_hosts():
    from backend.billing.stripe_urls import validate_stripe_return_url

    assert validate_stripe_return_url("http://localhost:3000/ok", "success_url").startswith(
        "http://localhost"
    )
    assert validate_stripe_return_url("https://www.orryon.com/home", "success_url").startswith(
        "https://www.orryon.com"
    )


def test_validate_stripe_return_url_rejects_untrusted():
    from backend.billing.stripe_urls import validate_stripe_return_url

    with pytest.raises(HTTPException) as exc:
        validate_stripe_return_url("https://evil.example/phish", "success_url")
    assert exc.value.status_code == 400


def test_billing_routes_not_on_account_settings_router():
    from backend.routers import account_settings as account_mod

    paths = {getattr(r, "path", "") for r in account_mod.router.routes}
    assert "/api/subscription" not in paths
    assert "/api/stripe/webhook" not in paths
