"""
backend/auth.py — JWT token creation and FastAPI dependency for auth.

Tokens are HS256-signed, contain user_id + email, expire in 30 days.
The secret is read from JWT_SECRET in .env (auto-generated on first run if missing).
"""

from __future__ import annotations

import os
import secrets
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

logger = logging.getLogger(__name__)

_JWT_ALGORITHM = "HS256"
_JWT_EXPIRY_DAYS = 30

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


def create_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(days=_JWT_EXPIRY_DAYS),
    }
    return jwt.encode(payload, _get_secret(), algorithm=_JWT_ALGORITHM)


def decode_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, _get_secret(), algorithms=[_JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")


async def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
) -> dict[str, str]:
    """FastAPI dependency — extracts and validates the JWT from the Authorization header."""
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing authorization header")
    payload = decode_token(creds.credentials)
    return {"user_id": payload["sub"], "email": payload["email"]}


# ── WebSocket tickets ────────────────────────────────────────────────────────
# Browsers can't set Authorization headers on WebSocket handshakes. The common
# workaround (JWT-in-query-string) leaks the long-lived token into any upstream
# logs, proxies, or browser history. Instead we mint a 30-second, single-use
# ticket tied to the user, validate it once on upgrade, and discard.
#
# In-memory store is fine for a single-process deployment. For multi-worker
# Railway setups we'd move this to Redis, but the ticket lifetime is short
# enough that a single dyno handles all websocket traffic today.

import threading
import time

_WS_TICKET_TTL_SECONDS = 30

# ticket_id -> (user_id, email, expires_at_epoch)
_ws_tickets: dict[str, tuple[str, str, float]] = {}
_ws_tickets_lock = threading.Lock()


def _ws_gc_locked() -> None:
    now = time.time()
    expired = [t for t, (_, _, exp) in _ws_tickets.items() if exp < now]
    for t in expired:
        _ws_tickets.pop(t, None)


def create_ws_ticket(user_id: str, email: str) -> str:
    """Issue a one-time ticket valid for 30 seconds."""
    ticket = secrets.token_urlsafe(32)
    expires = time.time() + _WS_TICKET_TTL_SECONDS
    with _ws_tickets_lock:
        _ws_gc_locked()
        _ws_tickets[ticket] = (user_id, email, expires)
    return ticket


def consume_ws_ticket(ticket: str) -> Optional[dict[str, str]]:
    """Atomically pop a ticket and return its user payload, or None if invalid/expired."""
    with _ws_tickets_lock:
        _ws_gc_locked()
        entry = _ws_tickets.pop(ticket, None)
    if entry is None:
        return None
    user_id, email, expires = entry
    if expires < time.time():
        return None
    return {"user_id": user_id, "email": email}
