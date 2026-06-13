"""Phase 0 — half-built scaffold routes stay hidden until feature flags are on."""
from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from backend.routers import approvals, calendar_google, connections


def _google_request() -> Request:
    return Request({"type": "http", "method": "GET", "path": "/", "headers": []})


def test_plaid_stub_routes_removed():
    paths = {getattr(r, "path", "") for r in connections.router.routes}
    assert "/api/connections/plaid/link" not in paths
    assert "/api/connections/plaid/exchange" not in paths


def test_connections_never_advertises_plaid_without_link_flag():
    with patch("backend.routers.connections.PLAID_LINK_ENABLED", False):
        import asyncio
        from backend.routers.connections import list_connections

        result = asyncio.run(list_connections(user={"user_id": "u1"}))
    assert "plaid" not in result["available"]
    assert result["tiers"]["plaid"]["status"] == "planned"


@pytest.mark.asyncio
async def test_approvals_pending_hidden_when_hitl_disabled():
    with patch.object(approvals, "APPROVALS_HITL_ENABLED", False):
        with pytest.raises(HTTPException) as exc:
            await approvals.list_pending(user={"user_id": "u1"})
        assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_google_oauth_auth_hidden_when_disabled():
    with patch.object(calendar_google, "GOOGLE_CALENDAR_OAUTH_ENABLED", False):
        with pytest.raises(HTTPException) as exc:
            await calendar_google.google_auth(
                _google_request(),
                user={"user_id": "u1", "email": "a@b.c", "jti": "x", "iat": 0},
            )
        assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_google_status_reports_oauth_availability():
    with patch.object(calendar_google, "GOOGLE_CALENDAR_OAUTH_ENABLED", False):
        result = await calendar_google.google_status(user={"user_id": "u1"})
    assert result["oauth_available"] is False
    assert result["connected"] is False
    assert result["sync_paused"] is False


@pytest.mark.asyncio
async def test_google_status_connected_only_when_oauth_on():
    uid = "user-oauth-status"
    with (
        patch.object(calendar_google, "GOOGLE_CALENDAR_OAUTH_ENABLED", True),
        patch.object(calendar_google, "get_google_tokens", return_value={"token": "x"}),
        patch.object(calendar_google, "get_connection") as mock_conn,
    ):
        mock_conn.return_value.execute.return_value.fetchone.return_value = (3,)
        result = await calendar_google.google_status(user={"user_id": uid})
    assert result["connected"] is True
    assert result["sync_paused"] is False

    with (
        patch.object(calendar_google, "GOOGLE_CALENDAR_OAUTH_ENABLED", False),
        patch.object(calendar_google, "get_google_tokens", return_value={"token": "x"}),
        patch.object(calendar_google, "get_connection") as mock_conn,
    ):
        mock_conn.return_value.execute.return_value.fetchone.return_value = (3,)
        result = await calendar_google.google_status(user={"user_id": uid})
    assert result["connected"] is False
    assert result["sync_paused"] is True
    assert result["synced_count"] == 3
