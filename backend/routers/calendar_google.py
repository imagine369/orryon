"""Google Calendar OAuth and bidirectional sync (gated by GOOGLE_CALENDAR_OAUTH_ENABLED)."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import secrets as _secrets
import time

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse

from backend.auth import get_current_user
from config import (
    APP_URL as CONFIG_APP_URL,
    GOOGLE_CALENDAR_OAUTH_ENABLED,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
)
from core.integrations.google_calendar import GOOGLE_SCOPES, pull_google_events
from core.integrations.google_tokens import get_google_tokens, store_google_tokens
from db import get_connection

router = APIRouter(tags=["calendar"])
logger = logging.getLogger(__name__)

APP_URL = CONFIG_APP_URL or os.getenv("APP_URL", "http://localhost:3000")
_OAUTH_STATE_TTL = 600
_OAUTH_IN_SCHEMA = GOOGLE_CALENDAR_OAUTH_ENABLED


def _allowed_oauth_origins() -> set[str]:
    """Origins we may use as the OAuth redirect base (must match Google Console)."""
    origins: set[str] = set()
    for env_key in ("FRONTEND_URL", "APP_URL"):
        for part in os.getenv(env_key, "").split(","):
            origin = part.strip().rstrip("/")
            if origin:
                origins.add(origin)
    origins.update({
        "https://www.orryon.com",
        "https://orryon.com",
        "http://localhost:3000",
    })
    return origins


def _google_redirect_uri(request: Request) -> str:
    """Resolve redirect URI — must exactly match a URI registered in Google Cloud Console."""
    override = os.getenv("GOOGLE_OAUTH_REDIRECT_URI", "").strip()
    if override:
        return override.rstrip("/")

    allowed = _allowed_oauth_origins()
    origin = (request.headers.get("origin") or "").rstrip("/")
    if origin in allowed:
        return f"{origin}/api/calendar/google/callback"

    for env_key in ("FRONTEND_URL", "APP_URL"):
        for part in os.getenv(env_key, "").split(","):
            base = part.strip().rstrip("/")
            if base:
                return f"{base}/api/calendar/google/callback"

    return f"{APP_URL.rstrip('/')}/api/calendar/google/callback"


def _require_google_oauth() -> None:
    if not GOOGLE_CALENDAR_OAUTH_ENABLED:
        raise HTTPException(status_code=404, detail="Not found")


def _oauth_state_secret() -> bytes:
    secret = os.getenv("JWT_SECRET", "")
    if not secret:
        from backend.auth import _get_secret
        secret = _get_secret()
    return secret.encode("utf-8")


def _sign_oauth_state(uid: str) -> str:
    payload = {"uid": uid, "nonce": _secrets.token_urlsafe(16), "iat": int(time.time())}
    body = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).rstrip(b"=")
    sig = hmac.new(_oauth_state_secret(), body, hashlib.sha256).digest()
    sig_b64 = base64.urlsafe_b64encode(sig).rstrip(b"=")
    return f"{body.decode()}.{sig_b64.decode()}"


def _verify_oauth_state(state: str) -> str:
    try:
        body_s, sig_s = state.split(".", 1)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid state parameter.")

    def _b64decode(s: str) -> bytes:
        pad = "=" * (-len(s) % 4)
        return base64.urlsafe_b64decode(s + pad)

    try:
        body = _b64decode(body_s)
        expected_sig = hmac.new(_oauth_state_secret(), body_s.encode(), hashlib.sha256).digest()
        given_sig = _b64decode(sig_s)
    except Exception:
        raise HTTPException(status_code=400, detail="Malformed state parameter.")

    if not hmac.compare_digest(expected_sig, given_sig):
        raise HTTPException(status_code=400, detail="State signature mismatch.")

    try:
        payload = json.loads(body)
    except Exception:
        raise HTTPException(status_code=400, detail="State payload unreadable.")

    if int(time.time()) - int(payload.get("iat", 0)) > _OAUTH_STATE_TTL:
        raise HTTPException(status_code=400, detail="OAuth state expired — please retry the connect flow.")

    uid = payload.get("uid", "")
    if not uid:
        raise HTTPException(status_code=400, detail="State is missing user id.")
    return uid


@router.get("/api/calendar/google/auth", include_in_schema=_OAUTH_IN_SCHEMA)
async def google_auth(request: Request, user: dict = Depends(get_current_user)):
    _require_google_oauth()
    uid = user["user_id"]
    redirect_uri = _google_redirect_uri(request)
    logger.info("Google OAuth auth redirect_uri=%s", redirect_uri)

    try:
        from google_auth_oauthlib.flow import Flow
    except ImportError:
        raise HTTPException(status_code=500, detail="Google auth library not available.")

    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [redirect_uri],
            }
        },
        scopes=GOOGLE_SCOPES,
        redirect_uri=redirect_uri,
    )
    signed_state = _sign_oauth_state(uid)
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=signed_state,
    )
    return RedirectResponse(auth_url)


@router.get("/api/calendar/google/callback", include_in_schema=_OAUTH_IN_SCHEMA)
async def google_callback(code: str, state: str, request: Request):
    _require_google_oauth()

    try:
        from google_auth_oauthlib.flow import Flow
    except ImportError:
        raise HTTPException(status_code=500, detail="Google auth library not available.")

    uid = _verify_oauth_state(state)
    redirect_uri = _google_redirect_uri(request)
    logger.info("Google OAuth callback redirect_uri=%s", redirect_uri)

    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [redirect_uri],
            }
        },
        scopes=GOOGLE_SCOPES,
        redirect_uri=redirect_uri,
        state=state,
    )
    flow.fetch_token(code=code)
    creds = flow.credentials
    store_google_tokens(uid, {
        "token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scopes": list(creds.scopes or GOOGLE_SCOPES),
    })
    pull_google_events(uid)

    frontend = os.getenv("FRONTEND_URL", APP_URL).rstrip("/")
    return RedirectResponse(f"{frontend}/home?calendar_connected=1")


@router.post("/api/calendar/google/sync", include_in_schema=_OAUTH_IN_SCHEMA)
async def google_sync(user: dict = Depends(get_current_user)):
    _require_google_oauth()
    uid = user["user_id"]
    if not get_google_tokens(uid):
        raise HTTPException(status_code=400, detail="Google Calendar not connected.")
    try:
        count = pull_google_events(uid)
    except Exception as exc:
        logger.error("Google Calendar sync failed for user %s: %s", uid, exc)
        raise HTTPException(status_code=500, detail=f"Google Calendar sync failed: {exc}")
    return {"synced": count, "message": f"Synced {count} event{'s' if count != 1 else ''} from Google Calendar."}


@router.delete("/api/calendar/google/disconnect", include_in_schema=_OAUTH_IN_SCHEMA)
async def google_disconnect(user: dict = Depends(get_current_user)):
    _require_google_oauth()
    uid = user["user_id"]
    with get_connection() as conn:
        conn.execute("DELETE FROM user_calendar_tokens WHERE user_id=?", (uid,))
        conn.commit()
    return {"disconnected": True}


@router.get("/api/calendar/google/status")
async def google_status(user: dict = Depends(get_current_user)):
    """Always available so the settings UI can show ICS-only vs OAuth state."""
    uid = user["user_id"]
    tokens = get_google_tokens(uid)
    conn = get_connection()
    row = conn.execute(
        "SELECT COUNT(*) AS cnt FROM events WHERE user_id=? AND is_synced_to_google=1", (uid,)
    ).fetchone()
    imported_count = row["cnt"] if isinstance(row, dict) else (row[0] if row else 0)
    oauth_on = GOOGLE_CALENDAR_OAUTH_ENABLED
    has_tokens = tokens is not None
    return {
        "oauth_available": oauth_on,
        "connected": oauth_on and has_tokens,
        "sync_paused": not oauth_on and has_tokens,
        "synced_count": imported_count,
        "bidirectional": oauth_on,
    }
