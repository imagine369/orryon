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
