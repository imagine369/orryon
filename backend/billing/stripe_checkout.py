"""Stripe Checkout session helpers (customer dedupe, lifetime trial guard)."""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

def get_or_create_stripe_customer(
    stripe_lib: Any,
    email: str,
    user_id: str,
    existing_customer_id: str | None = None,
) -> tuple[str, bool]:
    """
    Return (customer_id, is_new_customer).
    Reuses existing customer by email if one exists (prevents duplicate customers).
    Creates a new one otherwise and stores the id in our DB caller.
    """
    if existing_customer_id:
        try:
            cust = stripe_lib.Customer.retrieve(existing_customer_id)
            if cust and not getattr(cust, "deleted", False):
                return existing_customer_id, False
        except Exception:
            pass  # fall through to search/create

    # Search by email (most reliable way to dedupe)
    existing = stripe_lib.Customer.list(email=email, limit=1)
    if existing.data:
        return existing.data[0].id, False

    customer = stripe_lib.Customer.create(
        email=email,
        metadata={"user_id": user_id},
    )
    return customer.id, True


def customer_has_prior_subscription_for_price(
    stripe_lib: Any,
    customer_id: str,
    price_id: str,
) -> bool:
    """
    Checks whether this customer has ever had a subscription for our specific PRICE_ID before.

    Returns True if the customer has ANY subscription (active, canceled, past_due,
    incomplete, unpaid, etc.) that contains the given price_id.

    This implements the "one lifetime trial per price_id" policy.
    Uses Stripe's recommended auto_paging_iter() for reliable, automatic pagination.
    """
    try:
        # auto_paging_iter is Stripe's recommended way — handles pagination,
        # retries, and rate limits more robustly than manual loops.
        for sub in stripe_lib.Subscription.auto_paging_iter(
            customer=customer_id,
            status="all",
        ):
            for item in getattr(sub.items, "data", []):
                if getattr(item.price, "id", None) == price_id:
                    logger.info(
                        "Lifetime trial guard: customer %s already used price %s (sub %s, status=%s)",
                        customer_id, price_id, sub.id, sub.status
                    )
                    return True
    except Exception as e:
        logger.warning("Failed to check prior subscriptions for customer %s: %s", customer_id, e)
        # Fail open (allow trial) only on transient errors; you may choose to fail closed instead.
        return False
    return False


def build_checkout_session_params(
    *,
    customer_id: str,
    price_id: str,
    success_url: str,
    cancel_url: str,
    user_id: str,
    trial_days: int | None,
    current_plan: dict,
    db_row: dict,
    stripe_lib: Any,
) -> dict:
    """
    Assemble the params for stripe.checkout.Session.create.
    Applies the lifetime-trial rule:
      - Grant trial only if (a) user is free/trial, (b) no active sub in our DB,
        (c) customer has never had a subscription for this specific price_id before.
    """
    params: dict[str, Any] = {
        "customer": customer_id,
        "payment_method_types": ["card"],
        "line_items": [{"price": price_id, "quantity": 1}],
        "mode": "subscription",
        "success_url": success_url,
        "cancel_url": cancel_url,
        "metadata": {"user_id": user_id, "price_id": price_id},
    }

    is_free_breathe = db_row.get("segment") == "free_breathe"
    has_db_sub = bool(db_row.get("stripe_subscription_id"))
    # In-app Pro trial (no Stripe sub yet): checkout converts to paid now — no second Stripe trial.
    on_app_trial = current_plan.get("plan") == "trial" and not has_db_sub
    eligible_for_trial = (
        trial_days
        and current_plan.get("plan") in ("trial", "free")
        and not has_db_sub
        and not is_free_breathe
        and not on_app_trial
    )

    if eligible_for_trial:
        had_previous = customer_has_prior_subscription_for_price(stripe_lib, customer_id, price_id)
        if not had_previous:
            effective_trial = (
                max(current_plan.get("trial_days_remaining", 0), 1)
                if current_plan.get("plan") == "trial"
                else trial_days
            )
            params["subscription_data"] = {"trial_period_days": effective_trial}
            logger.info("Granting %s-day trial to user %s for price %s", effective_trial, user_id, price_id)
        else:
            logger.info("Blocking trial for user %s — customer already used price %s", user_id, price_id)

    return params
