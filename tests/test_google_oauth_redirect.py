"""Google OAuth redirect URI resolution."""
from __future__ import annotations

import os
from unittest.mock import patch

from starlette.requests import Request

from backend.routers import calendar_google


def _request(origin: str = "") -> Request:
    headers = [(b"origin", origin.encode())] if origin else []
    return Request({"type": "http", "method": "GET", "path": "/", "headers": headers})


def test_redirect_uri_prefers_request_origin_when_allowed():
    with patch.dict(
        "os.environ",
        {
            "FRONTEND_URL": "https://www.orryon.com",
            "APP_URL": "https://orryon.com",
            "GOOGLE_OAUTH_REDIRECT_URI": "",
        },
        clear=False,
    ):
        uri = calendar_google._google_redirect_uri(_request("https://orryon.com"))
    assert uri == "https://orryon.com/api/calendar/google/callback"


def test_redirect_uri_falls_back_to_frontend_url():
    with patch.dict(
        "os.environ",
        {
            "FRONTEND_URL": "https://www.orryon.com",
            "APP_URL": "",
            "GOOGLE_OAUTH_REDIRECT_URI": "",
        },
        clear=False,
    ):
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


def test_frontend_home_uses_first_csv_origin():
    with patch.dict(
        "os.environ",
        {"FRONTEND_URL": "https://www.orryon.com,https://orryon.com"},
        clear=False,
    ):
        assert calendar_google._frontend_home("?calendar_connected=1") == (
            "https://www.orryon.com/home?calendar_connected=1"
        )


def test_oauthlib_relax_token_scope_enabled():
    assert os.environ.get("OAUTHLIB_RELAX_TOKEN_SCOPE") == "1"


def test_sanitize_strips_accidental_env_key_prefix():
    raw = "GOOGLE_OAUTH_REDIRECT_URI=https://www.orryon.com/api/calendar/google/callback"
    assert calendar_google._sanitize_redirect_uri(raw) == (
        "https://www.orryon.com/api/calendar/google/callback"
    )


def test_oauth_state_round_trip_includes_redirect_uri():
    state = calendar_google._sign_oauth_state(
        "user-1",
        "https://www.orryon.com/api/calendar/google/callback",
    )
    uid, redirect_uri = calendar_google._verify_oauth_state(state)
    assert uid == "user-1"
    assert redirect_uri == "https://www.orryon.com/api/calendar/google/callback"


def test_clean_env_strips_key_prefix_and_whitespace(monkeypatch):
    from config import _clean_env

    monkeypatch.setenv(
        "GOOGLE_CLIENT_ID",
        " GOOGLE_CLIENT_ID=abc.apps.googleusercontent.com ",
    )
    assert _clean_env("GOOGLE_CLIENT_ID") == "abc.apps.googleusercontent.com"
