"""
backend/auth.py — JWT token creation and FastAPI dependency for auth.

Tokens are HS256-signed, contain user_id + email + jti (session ID),
and expire in 30 days. Each token maps to an `auth_sessions` row so
sessions can be individually revoked (stolen-device protection).

The secret is read from JWT_SECRET in .env (auto-generated on first run if missing).
"""

from __future__ import annotations

import os
import secrets
import time
import uuid
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from backend.cache import cache_get, cache_set

logger = logging.getLogger(__name__)

_JWT_ALGORITHM = "HS256"
_JWT_EXPIRY_DAYS = 30
_SESSION_CACHE_TTL = 60  # seconds
# Allow freshly-issued JWTs through when the session row isn't visible yet
# (multi-instance deploys, cold DB, or cache/DB race right after OTP verify).
_FRESH_TOKEN_GRACE_SECONDS = 180

_bearer_scheme = HTTPBearer(auto_error=False)

_cached_secret: Optional[str] = None


def _get_secret() -> str:
    global _cached_secret
    if _cached_secret:
        return _cached_secret
    secret = os.getenv("JWT_SECRET", "")
    if not secret:
        if os.getenv("NODE_ENV", "").lower() == "production":
            raise RuntimeError(
                "JWT_SECRET must be set in production. "
                "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
            )
        secret = secrets.token_hex(32)
        logger.warning("JWT_SECRET not set — generated ephemeral secret (tokens won't survive restarts)")
    _cached_secret = secret
    return secret


def _parse_device_name(user_agent: str) -> str:
    """Extract a human-friendly device name from a User-Agent string."""
    if not user_agent:
        return "Unknown device"
    ua = user_agent.lower()
    browser = "Browser"
    if "firefox" in ua:
        browser = "Firefox"
    elif "edg/" in ua or "edg " in ua:
        browser = "Edge"
    elif "chrome" in ua and "safari" in ua:
        browser = "Chrome"
    elif "safari" in ua:
        browser = "Safari"
    platform = ""
    if "iphone" in ua:
        platform = "iPhone"
    elif "ipad" in ua:
        platform = "iPad"
    elif "android" in ua:
        platform = "Android"
    elif "macintosh" in ua or "mac os" in ua:
        platform = "macOS"
    elif "windows" in ua:
        platform = "Windows"
    elif "linux" in ua:
        platform = "Linux"
    if platform:
        return f"{browser} on {platform}"
    return browser


def create_token(
    user_id: str,
    email: str,
    *,
    device_name: str = "",
    ip_address: str = "",
) -> str:
    """Mint a JWT and create the corresponding auth_sessions row."""
    from db import get_connection
    session_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    with get_connection() as conn:
        conn.execute(
            "INSERT INTO auth_sessions (id, user_id, device_name, ip_address, created_at, last_active, revoked) "
            "VALUES (?, ?, ?, ?, ?, ?, 0)",
            (session_id, user_id, device_name, ip_address, now_iso, now_iso),
        )
        conn.commit()

    payload = {
        "sub": user_id,
        "email": email,
        "jti": session_id,
        "iat": now,
        "exp": now + timedelta(days=_JWT_EXPIRY_DAYS),
    }
    return jwt.encode(payload, _get_secret(), algorithm=_JWT_ALGORITHM)


def decode_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, _get_secret(), algorithms=[_JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")


def jwt_iat_unix(payload: dict[str, Any]) -> int:
    """Normalize JWT `iat` to unix seconds for signing-key derivation."""
    iat = payload.get("iat")
    if iat is None:
        return 0
    if isinstance(iat, (int, float)):
        return int(iat)
    if isinstance(iat, datetime):
        dt = iat if iat.tzinfo else iat.replace(tzinfo=timezone.utc)
        return int(dt.timestamp())
    return 0


async def _check_session_valid(jti: str, *, issued_at_unix: int = 0) -> bool:
    """Check if a session is still active (not revoked). Cached for 60s."""
    if not jti:
        return False  # reject legacy tokens without jti — forces re-login

    cache_key = f"session_valid:{jti}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return cached

    from db import get_connection
    with get_connection() as conn:
        row = conn.execute(
            "SELECT revoked FROM auth_sessions WHERE id=?", (jti,),
        ).fetchone()

    if row is None:
        age = time.time() - issued_at_unix if issued_at_unix > 0 else 999_999
        valid = age < _FRESH_TOKEN_GRACE_SECONDS
    else:
        valid = not dict(row).get("revoked", 0)

    await cache_set(cache_key, valid, _SESSION_CACHE_TTL)

    if valid and row is not None:
        from db import update_row
        update_row(
            "auth_sessions",
            {"last_active": datetime.now(timezone.utc).isoformat()},
            {"id": jti},
        )

    return valid


async def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
) -> dict[str, str]:
    """FastAPI dependency — extracts and validates the JWT from the Authorization header."""
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing authorization header")
    payload = decode_token(creds.credentials)

    jti = payload.get("jti", "")
    if not await _check_session_valid(jti, issued_at_unix=jwt_iat_unix(payload)):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session revoked")

    return {
        "user_id": payload["sub"],
        "email": payload["email"],
        "jti": jti,
        "iat": jwt_iat_unix(payload),
    }


# ── WebSocket tickets ────────────────────────────────────────────────────────
# Browsers can't set Authorization headers on WebSocket handshakes. The common
# workaround (JWT-in-query-string) leaks the long-lived token into any upstream
# logs, proxies, or browser history. Instead we mint a 30-second, single-use
# ticket tied to the user, validate it once on upgrade, and discard.
#
# Stored in Redis when REDIS_URL is set (multi-worker safe); in-memory fallback
# for single-process local dev. See core/cache.py store_ws_ticket_async.

_WS_TICKET_TTL_SECONDS = 30


async def create_ws_ticket(user_id: str, email: str) -> str:
    """Issue a one-time ticket valid for 30 seconds."""
    from backend.cache import store_ws_ticket_async

    ticket = secrets.token_urlsafe(32)
    await store_ws_ticket_async(ticket, user_id, email, _WS_TICKET_TTL_SECONDS)
    return ticket


async def consume_ws_ticket(ticket: str) -> Optional[dict[str, str]]:
    """Atomically pop a ticket and return its user payload, or None if invalid/expired."""
    from backend.cache import consume_ws_ticket_async

    return await consume_ws_ticket_async(ticket)
