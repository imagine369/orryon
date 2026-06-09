"""Demo auth — local dev login and sample data seed."""
from __future__ import annotations

from unittest.mock import patch

from starlette.testclient import TestClient

from backend.main import app

_DEV_ORIGIN = "http://localhost:3000"


def test_demo_auth_returns_token_and_seeds_data():
    with patch("backend.routers.auth.IS_PRODUCTION", False):
        with TestClient(app) as client:
            res = client.post("/api/auth/demo", headers={"Origin": _DEV_ORIGIN})
        assert res.status_code == 200
        body = res.json()
        assert body.get("token")
        assert body.get("user", {}).get("email") == "demo@orryon.app"
