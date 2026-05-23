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
from core.plans import (
    API_SPEND_CAP_RATIO,
    MONTHLY_SPEND_CAP_USD,
    MONTHLY_SPEND_CAP_USD_BY_PLAN,
    PLAN_MONTHLY_PRICE_USD,
    UPGRADE_PLAN_BY_TIER,
    USAGE_NEAR_LIMIT_RATIO,
    get_monthly_spend_cap,
    get_monthly_token_cap,
    get_rate_limit_chat,
    get_suggested_upgrade_plan,
    resolve_plan,
    resolve_plan_for_user_id,
)
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

# OTP sends: generous enough for resend clicks; still blocks scripted abuse.
RATE_LIMIT_OTP = 12
RATE_LIMIT_OTP_IP = 30

def check_monthly_api_quota(user_id: str, plan: str) -> None:
    """
    Raise HTTP 402 if the user exceeded monthly API spend or token limits.
    Applies to chat, voice, vision, and background memory extraction.
    """
    spend_cap = get_monthly_spend_cap(plan)
    if spend_cap <= 0:
        return

    from db import get_monthly_spend, get_monthly_token_usage

    spend = get_monthly_spend(user_id)
    if spend >= spend_cap:
        raise HTTPException(
            status_code=402,
            detail={
                "code": "usage_limit_reached",
                "kind": "spend",
                "spend_usd": round(spend, 4),
                "cap_usd": spend_cap,
                "plan": plan,
                "upgrade_plan": get_suggested_upgrade_plan(plan),
                "message": (
                    "You've reached your included AI usage for this billing period. "
                    "Upgrade for a higher limit — it resets on your next billing date."
                ),
            },
        )

    token_cap = get_monthly_token_cap(plan)
    if token_cap <= 0:
        return

    usage = get_monthly_token_usage(user_id)
    total_tokens = usage["prompt_tokens"] + usage["completion_tokens"]
    if total_tokens >= token_cap:
        raise HTTPException(
            status_code=402,
            detail={
                "code": "usage_limit_reached",
                "kind": "tokens",
                "tokens_used": total_tokens,
                "token_cap": token_cap,
                "plan": plan,
                "upgrade_plan": get_suggested_upgrade_plan(plan),
                "message": (
                    "You've reached your included token allowance for this billing period. "
                    "Upgrade for a higher limit — it resets on your next billing date."
                ),
            },
        )


# ── Voice minute caps by plan (STT speak-in; TTS only on Premium Plus) ───────
# Free/starter: no voice API. Trial: capped speak-in, text replies, no TTS.
# Pro/Premium/Premium Plus: speak-in + text replies; Plus adds optional TTS.
# All paid voice usage also hits check_monthly_api_quota (27% of plan price).
# Chat abuse: CHAT_LIMITS + per-minute rate limits + require_signed_request on /api/chat.
VOICE_LIMITS_MINUTES: dict[str, int] = {
    "free":          0,
    "starter":       0,
    "trial":         0,     # previews Pro — text-only Life OS
    "pro":           0,     # text chat only; no STT/TTS
    "premium":       650,   # speak-in via chat mic; text replies
    "premium_plus":  1200,  # + optional TTS when voice_overlay on
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
    try:
        check_rate_limit(f"otp:email:{email}", RATE_LIMIT_OTP)
        check_rate_limit(f"otp:ip:{client_ip}", RATE_LIMIT_OTP_IP)
    except HTTPException:
        raise HTTPException(
            429,
            "Too many code requests. Wait a minute, then tap Resend code — or check spam for an earlier email.",
        ) from None


# ── Subscription Plan Resolution ──────────────────────────────────────────────

def resolve_plan_for_user(user_id: str) -> dict:
    """Look up a user by ID and return their effective plan."""
    info = resolve_plan_for_user_id(user_id)
    if info is None:
        raise HTTPException(404, "User not found")
    return info


async def require_active_plan(user: dict = Depends(get_current_user)) -> dict:
    """FastAPI dependency — blocks requests if the user's subscription is inactive."""
    info = resolve_plan_for_user(user["user_id"])
    if not info["is_active_pro"]:
        raise HTTPException(
            403,
            "Upgrade to Pro, Premium, or Premium Plus to access this feature.",
        )
    return user


def plan_allows_voice_input(plan: str) -> bool:
    """STT / mic — Premium and Premium Plus only."""
    return plan in ("premium", "premium_plus")


def plan_allows_voice_output(plan: str) -> bool:
    """TTS — Premium Plus only."""
    return plan == "premium_plus"


async def require_voice_input_plan(user: dict = Depends(get_current_user)) -> dict:
    """Require trial or paid plan with speak-in minutes (not free/starter)."""
    info = resolve_plan_for_user(user["user_id"])
    plan = info["plan"]
    if not plan_allows_voice_input(plan):
        raise HTTPException(
            403,
            "Speaking to Orryon is included on Premium and Premium Plus. "
            "Pro is text-only — upgrade to Premium to use the mic in chat.",
        )
    return user


async def require_voice_output_plan(user: dict = Depends(get_current_user)) -> dict:
    """Require Premium Plus for Orryon spoken replies (TTS)."""
    info = resolve_plan_for_user(user["user_id"])
    plan = info["plan"]
    if not plan_allows_voice_output(plan):
        raise HTTPException(
            403,
            "Hearing Orryon speak is a Premium Plus feature. "
            "Pro and Premium get text replies; upgrade to Premium Plus and turn on Speak responses aloud.",
        )
    return user


async def require_voice_plan(user: dict = Depends(get_current_user)) -> dict:
    """Legacy alias — voice input (STT). Prefer require_voice_input_plan / require_voice_output_plan."""
    return await require_voice_input_plan(user)


# ── Chat message quota ────────────────────────────────────────────────────────

CHAT_LIMITS: dict[str, int] = {
    "free":          0,
    "starter":       0,
    "trial":         3000,
    "pro":           3000,
    "premium":       -1,   # -1 = unlimited (bounded by monthly spend/token caps)
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
                "upgrade_plan": get_suggested_upgrade_plan(plan),
                "message": (
                    f"You've used all {limit} messages included in your {plan.title()} plan this month. "
                    "Upgrade for more messages and a higher AI allowance."
                ),
            },
        )
