"""Subscription API payload builders and Stripe reconciliation."""
from __future__ import annotations

import logging
from typing import Any

from backend.deps import resolve_plan
from core.stripe_sync import (
    _all_stripe_customer_ids,
    _find_paid_subscription,
    _persist_paid_plan,
)

logger = logging.getLogger(__name__)

def subscription_payload(user_row: dict) -> dict:
    """API shape for /api/subscription — includes Stripe linkage for post-checkout polling."""
    from core.usage_period import resolve_usage_period

    payload = resolve_plan(user_row)
    payload["has_stripe_subscription"] = bool(
        (user_row.get("stripe_subscription_id") or "").strip()
    )
    period = resolve_usage_period(user_row)
    payload["usage_resets_label"] = period.reset_label
    payload["reset_date"] = period.reset_at.isoformat()
    payload["is_trial_period"] = period.is_trial_period
    return payload


def sync_user_plan_from_stripe(stripe_lib: Any, user_row: dict) -> dict:
    """Pull active subscription from Stripe and persist plan (webhook fallback)."""
    user_id = user_row.get("id")
    customer_ids, user_row = _all_stripe_customer_ids(stripe_lib, user_row)

    if not customer_ids:
        logger.info("subscription sync: no Stripe customer for user %s", user_id)
        out = subscription_payload(user_row)
        out["sync_message"] = "No Stripe customer found for your login email."
        return out

    found = _find_paid_subscription(stripe_lib, customer_ids, user_id)
    if not found:
        logger.info("subscription sync: no paid subscription for user %s customers=%s", user_id, customer_ids)
        out = subscription_payload(user_row)
        out["sync_message"] = "No active Stripe subscription found for your account email."
        return out

    customer_id, sub_id, new_plan, price_id = found
    bps, bpe = "", ""
    try:
        sub_obj = stripe_lib.Subscription.retrieve(str(sub_id))
        from core.usage_period import stripe_subscription_period_bounds

        bps, bpe = stripe_subscription_period_bounds(sub_obj)
    except Exception as exc:
        logger.warning("subscription sync: could not read period for %s: %s", sub_id, exc)
    _persist_paid_plan(user_id, customer_id, sub_id, new_plan, billing_period_start=bps, billing_period_end=bpe)

    updated = dict(user_row)
    updated["plan"] = new_plan
    updated["stripe_customer_id"] = customer_id
    updated["stripe_subscription_id"] = sub_id
    updated["trial_ends_at"] = ""
    logger.info(
        "subscription sync: user=%s plan=%s sub=%s price_id=%s customer=%s",
        user_id,
        new_plan,
        sub_id,
        price_id,
        customer_id,
    )
    out = subscription_payload(updated)
    out["sync_message"] = f"Restored {new_plan} from Stripe."
    out["synced"] = True
    return out
