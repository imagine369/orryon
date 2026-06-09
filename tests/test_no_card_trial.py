"""NO_CARD_TRIAL beta — grant tier without Stripe."""
from __future__ import annotations

from unittest.mock import patch

import pytest
from starlette.testclient import TestClient

from backend.auth import create_token
from backend.main import app
from db.auth import get_or_create_user_by_email

_DEV_ORIGIN = "http://localhost:3000"


def _headers(email: str) -> dict[str, str]:
    user = get_or_create_user_by_email(email)
    token = create_token(user["id"], user["email"], device_name="pytest", ip_address="127.0.0.1")
    return {"Authorization": f"Bearer {token}", "Origin": _DEV_ORIGIN}


def test_no_card_tier_disabled_returns_404():
    with patch("config.NO_CARD_TRIAL", False):
        headers = _headers("pytest-no-card-off@orryon.app")
        with TestClient(app) as client:
            res = client.post(
                "/api/auth/no-card-tier",
                json={"tier": "pro"},
                headers=headers,
            )
        assert res.status_code == 404


def test_no_card_tier_blocked_in_production_without_override():
    with (
        patch("config.NO_CARD_TRIAL", True),
        patch("config.NO_CARD_TRIAL_ALLOW_PRODUCTION", False),
        patch("backend.routers.auth.IS_PRODUCTION", True),
    ):
        headers = _headers("pytest-no-card-prod-block@orryon.app")
        with TestClient(app) as client:
            res = client.post(
                "/api/auth/no-card-tier",
                json={"tier": "pro"},
                headers=headers,
            )
        assert res.status_code == 404


def test_email_status_exposes_no_card_trial_flag():
    with patch("config.NO_CARD_TRIAL", True), patch("backend.routers.auth.IS_PRODUCTION", False):
        with TestClient(app) as client:
            res = client.get("/api/auth/email-status")
        assert res.status_code == 200
        assert res.json()["no_card_trial_enabled"] is True


def test_no_card_tier_grants_plan():
    with patch("config.NO_CARD_TRIAL", True), patch("backend.routers.auth.IS_PRODUCTION", False):
        user = get_or_create_user_by_email("pytest-no-card-grant@orryon.app")
        headers = _headers("pytest-no-card-grant@orryon.app")
        with TestClient(app) as client:
            res = client.post(
                "/api/auth/no-card-tier",
                json={"tier": "premium"},
                headers=headers,
            )
        assert res.status_code == 200
        assert res.json()["plan"] == "premium"
        from backend.deps import resolve_plan_for_user

        info = resolve_plan_for_user(user["id"])
        assert info["plan"] == "premium"
