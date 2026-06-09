"""Phase 9 — integration surface and OpenAPI exposure."""
from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi import HTTPException

from backend.main import app
from backend.routers import calendar_google, connections


def _openapi_paths() -> set[str]:
    schema = app.openapi()
    return set(schema.get("paths", {}))


def test_plaid_routes_absent_from_app():
    paths = {getattr(r, "path", "") for r in connections.router.routes}
    assert "/api/connections/plaid/link" not in paths
    assert "/api/connections/plaid/exchange" not in paths
    openapi = _openapi_paths()
    assert not any("plaid" in p.lower() for p in openapi)


def test_google_oauth_routes_hidden_from_openapi_when_disabled():
    """OAuth routes use include_in_schema=GOOGLE_CALENDAR_OAUTH_ENABLED (off in tests)."""
    paths = _openapi_paths()
    assert "/api/calendar/google/auth" not in paths
    assert "/api/calendar/google/sync" not in paths
    assert "/api/calendar/google/status" in paths


@pytest.mark.asyncio
async def test_google_auth_404_when_oauth_disabled():
    with patch.object(calendar_google, "GOOGLE_CALENDAR_OAUTH_ENABLED", False):
        with pytest.raises(HTTPException) as exc:
            await calendar_google.google_auth(request=None, token="")
        assert exc.value.status_code == 404


def test_email_package_exports():
    from core.email import (
        build_contact_email,
        send_verification_code,
        send_event_reminder,
        smtp_diagnostics,
    )
    assert callable(send_verification_code)
    assert callable(build_contact_email)
    assert callable(send_event_reminder)
    assert callable(smtp_diagnostics)
