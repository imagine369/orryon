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

# Fail closed: only explicitly local environments get dev affordances. An unset
# or unrecognized NODE_ENV is treated as production to prevent accidental OTP
# code leakage, demo login exposure, etc.
_ENV = os.getenv("NODE_ENV", "").lower()
IS_LOCAL_DEV = _ENV in {"dev", "development", "local"}

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

# ── Voice minute caps by plan ─────────────────────────────────────────────────
# Voice (eve) is Premium and Premium Plus only. All other plans get 0.
VOICE_LIMITS_MINUTES: dict[str, int] = {
    "free":          0,
    "starter":       0,
    "trial":         0,
    "pro":           0,
    "premium":       350,
    "premium_plus":  500,
}

# On-demand top-up pricing
VOICE_TOPUP_MINUTES = 60
VOICE_TOPUP_PRICE_USD = 6.00
VOICE_TOPUP_PRICE_CENTS = 600  # for Stripe


def get_voice_limit_minutes(plan: str) -> int:
    """Return included voice minutes for *plan*. Unknown plans default to 0."""
    return VOICE_LIMITS_MINUTES.get(plan, 0)


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
                with get_connection() as conn:
                    conn.execute("UPDATE users SET plan='free' WHERE id=?", (user_row["id"],))
                    conn.commit()
            else:
                trial_days_remaining = max(0, delta.days)
        except Exception:
            pass

    return {
        "plan": plan,
        "trial_ends_at": trial_ends_at_str or None,
        "trial_days_remaining": trial_days_remaining,
        "is_active_pro": plan in ("trial", "pro", "premium", "premium_plus"),
        "is_free_tier": plan in ("free", "starter", "past_due"),
    }


def resolve_plan_for_user(user_id: str) -> dict:
    """Look up a user by ID and return their effective plan."""
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    if not row:
        raise HTTPException(404, "User not found")
    return resolve_plan(dict(row))


async def require_active_plan(user: dict = Depends(get_current_user)) -> dict:
    """FastAPI dependency — blocks requests if the user's subscription is inactive."""
    info = resolve_plan_for_user(user["user_id"])
    if not info["is_active_pro"]:
        raise HTTPException(
            403,
            "Upgrade to Pro, Premium, or Premium Plus to access this feature.",
        )
    return user


async def require_voice_plan(user: dict = Depends(get_current_user)) -> dict:
    """FastAPI dependency — restricts voice (eve) to Premium and Premium Plus only."""
    info = resolve_plan_for_user(user["user_id"])
    if info["plan"] not in ("premium", "premium_plus"):
        raise HTTPException(
            403,
            "Upgrade to Premium or Premium Plus to use Orryon's voice.",
        )
    return user


# ── Chat message quota ────────────────────────────────────────────────────────

CHAT_LIMITS: dict[str, int] = {
    "free":          0,
    "starter":       0,
    "trial":         500,
    "pro":           500,
    "premium":       -1,   # -1 = unlimited
    "premium_plus":  -1,
}

TIER_RANK: dict[str, int] = {
    "free":          0,
    "starter":       0,
    "trial":         1,
    "pro":           2,
    "premium":       3,
    "premium_plus":  4,
}


def get_chat_limit(plan: str) -> int:
    """Return monthly chat message limit for plan. -1 = unlimited."""
    return CHAT_LIMITS.get(plan, 0)


def get_tier_rank(plan: str) -> int:
    """Numeric rank for tier comparisons. Higher = more access."""
    return TIER_RANK.get(plan, 0)


def check_chat_quota(user_id: str, plan: str) -> None:
    """Raise HTTP 429 with code=chat_limit_reached if monthly message cap is hit."""
    limit = get_chat_limit(plan)
    if limit == -1:
        return  # unlimited
    from db import get_chat_message_count
    count = get_chat_message_count(user_id)
    if count >= limit:
        raise HTTPException(
            status_code=429,
            detail={
                "code": "chat_limit_reached",
                "messages_used": count,
                "limit": limit,
                "plan": plan,
                "message": (
                    f"You've used all {limit} messages included in your {plan.title()} plan this month. "
                    "Upgrade to Pro for 500 messages, or to Premium for unlimited."
                ),
            },
        )
