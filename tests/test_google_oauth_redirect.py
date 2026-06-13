"""Google OAuth redirect URI resolution."""
from __future__ import annotations

from unittest.mock import patch

import pytest
from starlette.requests import Request

from backend.routers import calendar_google


def _request(origin: str = "") -> Request:
    headers = [(b"origin", origin.encode())] if origin else []
    return Request({"type": "http", "method": "GET", "path": "/", "headers": headers})


def test_redirect_uri_prefers_request_origin_when_allowed():
    with patch.dict(
        "os.environ",
        {"FRONTEND_URL": "https://www.orryon.com", "APP_URL": "https://orryon.com"},
        clear=False,
    ):
        uri = calendar_google._google_redirect_uri(_request("https://orryon.com"))
    assert uri == "https://orryon.com/api/calendar/google/callback"


def test_redirect_uri_falls_back_to_frontend_url():
    with patch.dict("os.environ", {"FRONTEND_URL": "https://www.orryon.com", "APP_URL": ""}, clear=False):
        uri = calendar_google._google_redirect_uri(_request())
    assert uri == "https://www.orryon.com/api/calendar/google/callback"


def test_redirect_uri_honors_explicit_override():
    with patch.dict(
        "os.environ",
        {"GOOGLE_OAUTH_REDIRECT_URI": "https://www.orryon.com/api/calendar/google/callback"},
        clear=False,
    ):
        uri = calendar_google._google_redirect_uri(_request("https://orryon.com"))
    assert uri == "https://www.orryon.com/api/calendar/google/callback"
