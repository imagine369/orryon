"""
backend/deps.py — Shared FastAPI dependencies and middleware helpers.

Provides rate limiting, subscription plan enforcement, and other cross-cutting
concerns used by multiple routers.
"""

from __future__ import annotations

import asyncio
import os
import time
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request

from backend.auth import get_current_user
from db import get_connection

# ── Environment ───────────────────────────────────────────────────────────────

IS_PRODUCTION = os.getenv("NODE_ENV", "").lower() == "production"

# Any non-local environment counts as "remote" and suppresses dev-only affordances
# (on-screen OTP, unauthenticated demo login, etc.). This fixes the bug where
# NODE_ENV="staging" silently enabled dev behaviour.
_ENV = os.getenv("NODE_ENV", "").lower()
IS_LOCAL_DEV = _ENV in {"", "dev", "development", "local"}

# Demo login must be explicitly opted into. It was previously just "not production",
# which meant any misconfigured deployment (e.g. NODE_ENV unset) exposed the demo
# account.
ENABLE_DEMO = os.getenv("ENABLE_DEMO", "").lower() in {"1", "true", "yes"} and IS_LOCAL_DEV

# ── Rate Limiter (in-memory fallback — Redis version in cache.py) ─────────────

_rate_buckets: dict[str, list[float]] = defaultdict(list)
_RATE_WINDOW = 60
RATE_LIMIT_CHAT = 20
RATE_LIMIT_DEFAULT = 120

MONTHLY_SPEND_CAP_USD = 1.80

RATE_LIMIT_OTP = 5
RATE_LIMIT_OTP_IP = 10


def check_rate_limit(user_id: str, limit: int = RATE_LIMIT_DEFAULT) -> None:
    """Raise HTTP 429 if the user has exceeded their per-minute request quota."""
    now = time.time()
    bucket = _rate_buckets[user_id]
    _rate_buckets[user_id] = [t for t in bucket if now - t < _RATE_WINDOW]
    if len(_rate_buckets[user_id]) >= limit:
        raise HTTPException(429, "Too many requests. Please wait a moment.")
    _rate_buckets[user_id].append(now)


async def check_rate_limit_redis(user_id: str, limit: int = RATE_LIMIT_DEFAULT) -> None:
    """Async rate limiter that uses Redis when available, in-memory otherwise."""
    from backend.cache import check_rate_limit_async
    allowed = await check_rate_limit_async(user_id, limit, _RATE_WINDOW)
    if not allowed:
        raise HTTPException(429, "Too many requests. Please wait a moment.")


def check_otp_rate_limit(request: Request, email: str) -> None:
    """Rate-limit OTP sends by both email and client IP to prevent abuse."""
    client_ip = request.client.host if request.client else "unknown"
    check_rate_limit(f"otp:email:{email}", RATE_LIMIT_OTP)
    check_rate_limit(f"otp:ip:{client_ip}", RATE_LIMIT_OTP_IP)


# ── Subscription Plan Resolution ──────────────────────────────────────────────

def resolve_plan(user_row: dict) -> dict:
    """Compute the effective plan for a user, auto-expiring trials."""
    plan = user_row.get("plan") or "free"
    trial_ends_at_str = user_row.get("trial_ends_at") or ""
    trial_days_remaining = 0

    if plan == "trial" and trial_ends_at_str:
        try:
            trial_ends = datetime.fromisoformat(trial_ends_at_str)
            if trial_ends.tzinfo is None:
                trial_ends = trial_ends.replace(tzinfo=timezone.utc)
            delta = trial_ends - datetime.now(timezone.utc)
            if delta.total_seconds() <= 0:
                plan = "free"
                conn = get_connection()
                conn.execute("UPDATE users SET plan='free' WHERE id=?", (user_row["id"],))
                conn.commit()
                conn.close()
            else:
                trial_days_remaining = max(0, delta.days)
        except Exception:
            pass

    return {
        "plan": plan,
        "trial_ends_at": trial_ends_at_str or None,
        "trial_days_remaining": trial_days_remaining,
        "is_active_pro": plan in ("trial", "pro"),
    }


def resolve_plan_for_user(user_id: str) -> dict:
    """Look up a user by ID and return their effective plan."""
    conn = get_connection()
    row = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "User not found")
    return resolve_plan(dict(row))


async def require_active_plan(user: dict = Depends(get_current_user)) -> dict:
    """FastAPI dependency — blocks requests if the user's subscription is inactive."""
    info = resolve_plan_for_user(user["user_id"])
    if not info["is_active_pro"]:
        raise HTTPException(
            403,
            "Your Pro trial has ended. Upgrade to continue using this feature.",
        )
    return user
