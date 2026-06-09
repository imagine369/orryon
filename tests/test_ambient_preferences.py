"""Unit and HTTP tests for Smart Ambient Pickup preference helpers and API."""
from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from backend.auth import create_token
from db.auth import get_or_create_user_by_email
from db.preferences import (
    clamp_ambient_sensitivity,
    get_user_preferences,
    normalize_ambient_mode_enabled,
    normalize_ambient_sound_style,
)

_DEV_ORIGIN = "http://localhost:3000"
_AMBIENT_TEST_EMAIL = "pytest-ambient@orryon.app"


def _headers_for_email(email: str) -> dict[str, str]:
    user = get_or_create_user_by_email(email)
    token = create_token(user["id"], user["email"], device_name="pytest", ip_address="127.0.0.1")
    return {
        "Authorization": f"Bearer {token}",
        "Origin": _DEV_ORIGIN,
    }


@pytest.fixture
def ambient_auth_headers():
    return _headers_for_email(_AMBIENT_TEST_EMAIL)


# ── db.preferences helpers ────────────────────────────────────────────────────


def test_clamp_ambient_sensitivity_mid():
    assert clamp_ambient_sensitivity(0.5) == 0.5


def test_clamp_ambient_sensitivity_clamps_high_and_low():
    assert clamp_ambient_sensitivity(1.5) == 1.0
    assert clamp_ambient_sensitivity(-0.2) == 0.0


def test_clamp_ambient_sensitivity_invalid_defaults():
    assert clamp_ambient_sensitivity(None) == 0.5
    assert clamp_ambient_sensitivity("bad") == 0.5


def test_clamp_ambient_sensitivity_nan_defaults():
    assert clamp_ambient_sensitivity(float("nan")) == 0.5


def test_normalize_ambient_sound_style_valid():
    assert normalize_ambient_sound_style("soft_glow_rise") == "soft_glow_rise"
    assert normalize_ambient_sound_style("crystal_bloom") == "crystal_bloom"
    assert normalize_ambient_sound_style("  crystal_bloom  ") == "crystal_bloom"


def test_normalize_ambient_sound_style_invalid_defaults():
    assert normalize_ambient_sound_style("invalid") == "soft_glow_rise"
    assert normalize_ambient_sound_style(None) == "soft_glow_rise"


def test_normalize_ambient_mode_enabled_coerces_to_zero_or_one():
    assert normalize_ambient_mode_enabled(0) == 0
    assert normalize_ambient_mode_enabled(1) == 1
    assert normalize_ambient_mode_enabled(2) == 1
    assert normalize_ambient_mode_enabled(-1) == 1
    assert normalize_ambient_mode_enabled(None) == 0
    assert normalize_ambient_mode_enabled(False) == 0
    assert normalize_ambient_mode_enabled(True) == 1


# ── GET / PATCH /api/preferences ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_preferences_get_includes_ambient_fields(ambient_auth_headers):
    from backend.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/preferences", headers=ambient_auth_headers)
    assert res.status_code == 200
    body = res.json()
    assert "ambient_mode_enabled" in body
    assert isinstance(body["ambient_mode_enabled"], bool)
    assert "ambient_sensitivity" in body
    assert isinstance(body["ambient_sensitivity"], float)
    assert body["ambient_sound_style"] in ("soft_glow_rise", "crystal_bloom")


@pytest.mark.asyncio
async def test_preferences_patch_ambient_round_trip(ambient_auth_headers):
    from backend.main import app

    transport = ASGITransport(app=app)
    patch = {
        "ambient_mode_enabled": 1,
        "ambient_sensitivity": 0.8,
        "ambient_sound_style": "crystal_bloom",
    }
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        patch_res = await client.patch(
            "/api/preferences",
            headers=ambient_auth_headers,
            json=patch,
        )
        assert patch_res.status_code == 200
        assert patch_res.json().get("updated") is True

        get_res = await client.get("/api/preferences", headers=ambient_auth_headers)
    assert get_res.status_code == 200
    body = get_res.json()
    assert body["ambient_mode_enabled"] is True
    assert body["ambient_sensitivity"] == 0.8
    assert body["ambient_sound_style"] == "crystal_bloom"


@pytest.mark.asyncio
async def test_preferences_patch_ambient_mode_enabled_stored_as_zero_or_one(
    ambient_auth_headers,
):
    from backend.main import app

    uid = get_or_create_user_by_email(_AMBIENT_TEST_EMAIL)["id"]
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.patch(
            "/api/preferences",
            headers=ambient_auth_headers,
            json={"ambient_mode_enabled": 2},
        )
    assert res.status_code == 200
    assert get_user_preferences(uid)["ambient_mode_enabled"] == 1

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        get_res = await client.get("/api/preferences", headers=ambient_auth_headers)
    assert get_res.json()["ambient_mode_enabled"] is True

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        off_res = await client.patch(
            "/api/preferences",
            headers=ambient_auth_headers,
            json={"ambient_mode_enabled": 0},
        )
    assert off_res.status_code == 200
    assert get_user_preferences(uid)["ambient_mode_enabled"] == 0


@pytest.mark.asyncio
async def test_preferences_patch_ambient_sensitivity_clamped_on_get(ambient_auth_headers):
    from backend.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.patch(
            "/api/preferences",
            headers=ambient_auth_headers,
            json={"ambient_sensitivity": 9.9},
        )
        assert res.status_code == 200
        get_res = await client.get("/api/preferences", headers=ambient_auth_headers)
    assert get_res.json()["ambient_sensitivity"] == 1.0


@pytest.mark.asyncio
async def test_preferences_patch_invalid_sound_style_normalized_on_get(ambient_auth_headers):
    from backend.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.patch(
            "/api/preferences",
            headers=ambient_auth_headers,
            json={"ambient_sound_style": "not_a_real_style"},
        )
        assert res.status_code == 200
        get_res = await client.get("/api/preferences", headers=ambient_auth_headers)
    assert get_res.json()["ambient_sound_style"] == "soft_glow_rise"
