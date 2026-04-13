"""
backend/deps.py — Shared FastAPI dependencies and middleware helpers.

Provides rate limiting, subscription plan enforcement, and other cross-cutting
concerns used by multiple routers.
"""

from __future__ import annotations

import os
import time
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import Depends, HTTPException

from backend.auth import get_current_user
from db import get_connection

# ── Environment ───────────────────────────────────────────────────────────────

IS_PRODUCTION = os.getenv("NODE_ENV", "").lower() == "production"

# ── Rate Limiter (in-memory, per-user) ────────────────────────────────────────

_rate_buckets: dict[str, list[float]] = defaultdict(list)
_RATE_WINDOW = 60          # seconds
RATE_LIMIT_CHAT = 20       # max chat requests per window
RATE_LIMIT_DEFAULT = 120   # max general requests per window

MONTHLY_SPEND_CAP_USD = 1.80


def check_rate_limit(user_id: str, limit: int = RATE_LIMIT_DEFAULT) -> None:
    """Raise HTTP 429 if the user has exceeded their per-minute request quota."""
    now = time.time()
    bucket = _rate_buckets[user_id]
    _rate_buckets[user_id] = [t for t in bucket if now - t < _RATE_WINDOW]
    if len(_rate_buckets[user_id]) >= limit:
        raise HTTPException(429, "Too many requests. Please wait a moment.")
    _rate_buckets[user_id].append(now)


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
