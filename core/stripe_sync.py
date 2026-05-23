"""
core/stripe_sync.py — Stripe customer/subscription discovery and plan persistence.

Shared by core/usage_period and backend/routers/account (webhook fallback sync).
"""

from __future__ import annotations

import logging
from typing import Any

from db import get_connection

logger = logging.getLogger(__name__)

_PLAN_RANK = {"premium_plus": 3, "premium": 2, "pro": 1}


def _stripe_val(obj: Any, key: str, default: Any = None) -> Any:
    """Read a field from a Stripe SDK object or plain dict."""
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _all_stripe_customer_ids(stripe_lib: Any, user_row: dict) -> tuple[list[str], dict]:
    """Collect every Stripe customer id that might belong to this user (stored id + email matches)."""
    row = dict(user_row)
    uid = row["id"]
    seen: set[str] = set()
    ordered: list[str] = []

    def add(cid: str | None) -> None:
        if cid and cid not in seen:
            seen.add(cid)
            ordered.append(cid)

    stored = (row.get("stripe_customer_id") or "").strip()
    if stored:
        try:
            cust = stripe_lib.Customer.retrieve(stored)
            if cust and not _stripe_val(cust, "deleted", False):
                add(stored)
        except Exception:
            pass

    email = (row.get("email") or "").strip().lower()
    if email:
        try:
            for c in stripe_lib.Customer.list(email=email, limit=10).data or []:
                add(_stripe_val(c, "id"))
        except Exception as e:
            logger.warning("Stripe customer list by email failed for %s: %s", uid, e)

    try:
        for c in stripe_lib.Customer.search(query=f"metadata['user_id']:'{uid}'", limit=5).data or []:
            add(_stripe_val(c, "id"))
    except Exception as e:
        logger.warning("Stripe customer search failed for user %s: %s", uid, e)

    if ordered:
        row["stripe_customer_id"] = ordered[0]
    return ordered, row


def _resolve_stripe_customer_id(stripe_lib: Any, user_row: dict) -> tuple[str, dict]:
    """
    Return Stripe customer id for this user, linking by stored id, email, or metadata.
    Checkout can create a Stripe customer before our DB row is updated if the webhook fails.
    """
    ids, row = _all_stripe_customer_ids(stripe_lib, user_row)
    return (ids[0] if ids else ""), row


def _plan_from_stripe_price(price_obj: Any, price_id: str) -> str:
    """Map Stripe price to plan; infer from amount when env price ids are missing."""
    from config import PRICE_ID_TO_PLAN

    if price_id and price_id in PRICE_ID_TO_PLAN:
        return PRICE_ID_TO_PLAN[price_id]

    unit_amount = _stripe_val(price_obj, "unit_amount")
    if unit_amount is None:
        recurring = _stripe_val(price_obj, "recurring") or {}
        unit_amount = _stripe_val(recurring, "unit_amount")
    try:
        cents = int(unit_amount) if unit_amount is not None else 0
    except (TypeError, ValueError):
        cents = 0

    if cents >= 4500:
        return "premium_plus"
    if cents >= 2800:
        return "premium"
    if cents >= 1500:
        return "pro"

    if price_id:
        logger.warning(
            "Unknown Stripe price_id=%r (unit_amount=%s) — defaulting to premium for paid checkout",
            price_id,
            unit_amount,
        )
        return "premium"
    return "pro"


def _plan_from_stripe_subscription(sub_obj: Any) -> tuple[str, str]:
    items = _stripe_val(_stripe_val(sub_obj, "items"), "data") or []
    price_id = ""
    price_obj: Any = None
    if items:
        price_obj = _stripe_val(items[0], "price")
        if isinstance(price_obj, str):
            price_id = price_obj
        else:
            price_id = (_stripe_val(price_obj, "id") or "").strip()
    new_plan = _plan_from_stripe_price(price_obj, price_id)
    return new_plan, price_id


def _pick_best_subscription(stripe_lib: Any, sub_obj: Any) -> tuple[str, str, str] | None:
    """Return (sub_id, plan, price_id) for a subscription object."""
    status = _stripe_val(sub_obj, "status")
    if status not in ("active", "trialing", "past_due"):
        return None
    sub_id = _stripe_val(sub_obj, "id") or ""
    plan, price_id = _plan_from_stripe_subscription(sub_obj)
    if not sub_id:
        return None
    return sub_id, plan, price_id


def _find_paid_subscription(stripe_lib: Any, customer_ids: list[str], user_id: str) -> tuple[str, str, str, str] | None:
    """
    Find the best active subscription across customers and completed checkout sessions.
    Returns (customer_id, sub_id, plan, price_id).
    """
    best: tuple[str, str, str, str] | None = None
    best_rank = 0

    def consider(customer_id: str, sub_id: str, plan: str, price_id: str) -> None:
        nonlocal best, best_rank
        rank = _PLAN_RANK.get(plan, 0)
        if rank > best_rank:
            best_rank = rank
            best = (customer_id, sub_id, plan, price_id)

    for customer_id in customer_ids:
        try:
            subs = stripe_lib.Subscription.list(customer=customer_id, status="all", limit=20)
            for s in _stripe_val(subs, "data") or []:
                picked = _pick_best_subscription(stripe_lib, s)
                if picked:
                    sub_id, plan, price_id = picked
                    consider(customer_id, sub_id, plan, price_id)
        except Exception as e:
            logger.warning("subscription list failed customer=%s user=%s: %s", customer_id, user_id, e)

        try:
            sessions = stripe_lib.checkout.Session.list(customer=customer_id, limit=15)
            for sess in _stripe_val(sessions, "data") or []:
                if _stripe_val(sess, "payment_status") != "paid":
                    continue
                if _stripe_val(sess, "mode") != "subscription":
                    continue
                sub_id = _stripe_val(sess, "subscription")
                if not sub_id:
                    continue
                if isinstance(sub_id, str):
                    sub_obj = stripe_lib.Subscription.retrieve(sub_id)
                else:
                    sub_obj = sub_id
                picked = _pick_best_subscription(stripe_lib, sub_obj)
                if picked:
                    sub_id_s, plan, price_id = picked
                    consider(customer_id, sub_id_s, plan, price_id)
        except Exception as e:
            logger.warning("checkout session list failed customer=%s user=%s: %s", customer_id, user_id, e)

    return best


def _persist_paid_plan(
    user_id: str,
    customer_id: str,
    sub_id: str,
    plan: str,
    *,
    billing_period_start: str = "",
    billing_period_end: str = "",
) -> None:
    with get_connection() as conn:
        conn.execute(
            "UPDATE users SET plan=?, stripe_customer_id=?, stripe_subscription_id=?, "
            "trial_ends_at='', segment='', billing_period_start=?, billing_period_end=? WHERE id=?",
            (plan, customer_id, sub_id, billing_period_start, billing_period_end, user_id),
        )
        conn.commit()
