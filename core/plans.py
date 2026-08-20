"""
core/plans.py — Subscription plan resolution and API quota caps (no FastAPI).

Used by core/grok_agent (memory extraction) and re-exported from backend/deps.py
for HTTP handlers.
"""

from __future__ import annotations

from datetime import datetime, timezone

from db import get_connection

# Monthly list price (USD) — keep in sync with frontend pricing page.
PLAN_MONTHLY_PRICE_USD: dict[str, float] = {
    "free":          0.0,
    "starter":       0.0,
    "past_due":      0.0,
    "trial":         0.0,   # 14-day trial is free; API budget is prorated (see below)
    "pro":           22.0,
    "premium":       33.0,
    "premium_plus":  49.0,
}

# API spend cap ≈ 25–30% of plan price — leaves margin; upgrade tier = higher cap.
API_SPEND_CAP_RATIO = 0.27

# ~4.5M tokens per $12 cap historically — scales token backstop with spend cap.
_TOKENS_PER_USD_SPEND_CAP = 375_000

# Trial: fixed low cap (plan price is $0) to encourage conversion before Pro.
_TRIAL_API_SPEND_CAP_USD = 2.00

# Next tier when user hits message or API limits (None = top tier).
UPGRADE_PLAN_BY_TIER: dict[str, str | None] = {
    "free": "pro",
    "starter": "pro",
    "trial": "pro",
    "pro": "premium",
    "premium": "premium_plus",
    "premium_plus": None,
    "past_due": "pro",
}

USAGE_NEAR_LIMIT_RATIO = 0.80

RATE_LIMIT_CHAT = 20

# Per-minute chat requests (abuse throttle; separate from monthly message cap).
RATE_LIMIT_CHAT_BY_PLAN: dict[str, int] = {
    "trial":         20,
    "pro":           20,
    "premium":       30,
    "premium_plus":  40,
}


def get_suggested_upgrade_plan(plan: str) -> str | None:
    return UPGRADE_PLAN_BY_TIER.get(plan)


def _compute_monthly_spend_caps() -> dict[str, float]:
    caps: dict[str, float] = {
        "free": 0.0,
        "starter": 0.0,
        "past_due": 0.0,
        "trial": _TRIAL_API_SPEND_CAP_USD,
    }
    for plan in ("pro", "premium", "premium_plus"):
        price = PLAN_MONTHLY_PRICE_USD[plan]
        caps[plan] = round(price * API_SPEND_CAP_RATIO, 2)
    return caps


MONTHLY_SPEND_CAP_USD_BY_PLAN: dict[str, float] = _compute_monthly_spend_caps()

# Deprecated global cap — use get_monthly_spend_cap(plan) instead.
MONTHLY_SPEND_CAP_USD = MONTHLY_SPEND_CAP_USD_BY_PLAN["pro"]


def get_rate_limit_chat(plan: str) -> int:
    return RATE_LIMIT_CHAT_BY_PLAN.get(plan, RATE_LIMIT_CHAT)


def get_monthly_spend_cap(plan: str) -> float:
    """Max estimated API spend (USD) for this plan per calendar month."""
    return MONTHLY_SPEND_CAP_USD_BY_PLAN.get(plan, 0.0)


def get_monthly_token_cap(plan: str) -> int:
    """Max prompt+completion tokens per calendar month. 0 = no paid access."""
    spend_cap = get_monthly_spend_cap(plan)
    if spend_cap <= 0:
        return 0
    return int(spend_cap * _TOKENS_PER_USD_SPEND_CAP)


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

    from config import BILLING_ENABLED

    paid = plan in ("trial", "pro", "premium", "premium_plus")
    return {
        "plan": plan,
        "trial_ends_at": trial_ends_at_str or None,
        "trial_days_remaining": trial_days_remaining,
        "is_active_pro": True if not BILLING_ENABLED else paid,
        "is_free_tier": False if not BILLING_ENABLED else plan in ("free", "starter", "past_due"),
        "billing_enabled": BILLING_ENABLED,
    }


def resolve_plan_for_user_id(user_id: str) -> dict | None:
    """Look up a user by ID and return their effective plan, or None if missing."""
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    if not row:
        return None
    return resolve_plan(dict(row))
