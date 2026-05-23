"""
backend/routers/billing.py — Stripe subscription checkout, portal, and voice top-up.

Extracted from account.py (Phase 2b).
"""
from __future__ import annotations

import logging
import os

from fastapi import APIRouter, Depends, HTTPException, Request

from backend.auth import get_current_user
from backend.billing.stripe_checkout import (
    build_checkout_session_params,
    get_or_create_stripe_customer,
)
from backend.billing.stripe_urls import validate_stripe_return_url
from backend.billing.subscription_sync import (
    subscription_payload,
    sync_user_plan_from_stripe,
)
from backend.deps import require_active_plan, resolve_plan
from backend.schemas import CheckoutReq
from db import get_connection

logger = logging.getLogger(__name__)

router = APIRouter(tags=["billing"])

@router.get("/api/subscription")
async def get_subscription(user: dict = Depends(get_current_user)):
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE id=?", (user["user_id"],)).fetchone()
    if not row:
        raise HTTPException(404, "User not found")
    row = dict(row)
    resolved = resolve_plan(row)
    has_stripe = bool((row.get("stripe_subscription_id") or "").strip())
    has_customer = bool((row.get("stripe_customer_id") or "").strip())
    needs_reconcile = resolved["plan"] in ("free", "trial") or (
        (has_stripe or has_customer)
        and not (row.get("billing_period_end") or "").strip()
    )
    if needs_reconcile and has_stripe:
        from config import STRIPE_ENABLED, STRIPE_SECRET_KEY

        if STRIPE_ENABLED:
            try:
                import stripe as stripe_lib

                stripe_lib.api_key = STRIPE_SECRET_KEY
                return sync_user_plan_from_stripe(stripe_lib, row)
            except Exception as e:
                logger.warning("subscription reconcile on GET failed for %s: %s", row.get("id"), e)
    elif has_stripe:
        from core.usage_period import refresh_billing_period_from_stripe

        row = refresh_billing_period_from_stripe(row)
    return subscription_payload(row)


@router.post("/api/subscription/sync")
async def sync_subscription_from_stripe(user: dict = Depends(get_current_user)):
    """Reconcile users.plan from Stripe when checkout webhook was delayed or missed."""
    from config import STRIPE_ENABLED, STRIPE_SECRET_KEY

    if not STRIPE_ENABLED:
        raise HTTPException(503, "Stripe is not configured")
    try:
        import stripe as stripe_lib
        stripe_lib.api_key = STRIPE_SECRET_KEY
    except ImportError:
        raise HTTPException(503, "stripe package not installed")

    with get_connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE id=?", (user["user_id"],)).fetchone()
    if not row:
        raise HTTPException(404, "User not found")
    return sync_user_plan_from_stripe(stripe_lib, dict(row))
@router.get("/api/subscription/plans")
async def get_subscription_plans():
    """Public plan → Stripe price_id map (from server env). Frontend must use this, not guessed IDs."""
    from config import (
        PRICE_ID_TO_PLAN,
        STRIPE_PRICE_PREMIUM_ANNUAL,
        STRIPE_PRICE_PREMIUM_MONTHLY,
        STRIPE_PRICE_PREMIUM_PLUS_ANNUAL,
        STRIPE_PRICE_PREMIUM_PLUS_MONTHLY,
        STRIPE_PRICE_PRO_ANNUAL,
        STRIPE_PRICE_PRO_MONTHLY,
    )

    plans = {
        "pro": {
            "monthly": STRIPE_PRICE_PRO_MONTHLY or None,
            "annual": STRIPE_PRICE_PRO_ANNUAL or None,
        },
        "premium": {
            "monthly": STRIPE_PRICE_PREMIUM_MONTHLY or None,
            "annual": STRIPE_PRICE_PREMIUM_ANNUAL or None,
        },
        "premium_plus": {
            "monthly": STRIPE_PRICE_PREMIUM_PLUS_MONTHLY or None,
            "annual": STRIPE_PRICE_PREMIUM_PLUS_ANNUAL or None,
        },
    }

    seen: dict[str, str] = {}
    warnings: list[str] = []
    for tier, periods in plans.items():
        for period, pid in periods.items():
            if not pid:
                continue
            label = f"{tier}/{period}"
            if pid in seen:
                warnings.append(
                    f"{label} uses the same Stripe price_id as {seen[pid]} ({pid})"
                )
            seen[pid] = label

    return {"plans": plans, "warnings": warnings, "price_id_to_plan": PRICE_ID_TO_PLAN}


@router.post("/api/subscription/checkout")
async def create_checkout(body: CheckoutReq, user: dict = Depends(get_current_user)):
    from config import PRICE_ID_TO_PLAN, STRIPE_ENABLED, STRIPE_SECRET_KEY, ALLOWED_STRIPE_PRICES, get_trial_days
    if not STRIPE_ENABLED:
        raise HTTPException(503, "Stripe is not configured. Set STRIPE_SECRET_KEY in .env")
    if ALLOWED_STRIPE_PRICES and body.price_id not in ALLOWED_STRIPE_PRICES:
        raise HTTPException(400, "Invalid price ID")

    mapped_plan = PRICE_ID_TO_PLAN.get(body.price_id)
    if body.tier:
        tier = body.tier.strip().lower()
        if mapped_plan and tier != mapped_plan:
            raise HTTPException(
                400,
                f"You selected {tier}, but the configured Stripe price is for {mapped_plan}. "
                f"Fix STRIPE_PRICE_{tier.upper()}_* on the server (must differ from other tiers).",
            )
        if not mapped_plan:
            raise HTTPException(400, f"Unknown price_id for tier {tier}")
    try:
        import stripe as stripe_lib
        stripe_lib.api_key = STRIPE_SECRET_KEY
    except ImportError:
        raise HTTPException(503, "stripe package not installed. Run: pip install stripe")

    success_url = validate_stripe_return_url(body.success_url, "success_url")
    cancel_url = validate_stripe_return_url(body.cancel_url, "cancel_url")

    with get_connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE id=?", (user["user_id"],)).fetchone()
    if not row:
        raise HTTPException(404, "User not found")
    row = dict(row)

    try:
        # 1. Customer creation / retrieval (with reuse by email)
        customer_id, is_new = get_or_create_stripe_customer(
            stripe_lib, row["email"], row["id"], row.get("stripe_customer_id")
        )
        if is_new:
            with get_connection() as conn:
                conn.execute("UPDATE users SET stripe_customer_id=? WHERE id=?", (customer_id, row["id"]))
                conn.commit()

        current_plan = resolve_plan(row)
        trial_days = get_trial_days(body.price_id)

        # 2. Build Checkout Session params (applies lifetime trial guard)
        params = build_checkout_session_params(
            customer_id=customer_id,
            price_id=body.price_id,
            success_url=success_url,
            cancel_url=cancel_url,
            user_id=row["id"],
            trial_days=trial_days,
            current_plan=current_plan,
            db_row=row,
            stripe_lib=stripe_lib,
        )

        try:
            session = stripe_lib.checkout.Session.create(**params)
        except stripe_lib.error.InvalidRequestError as e:
            err_msg = str(e).lower()
            # Stale customer (test/live mode mismatch) — recreate once
            if "no such customer" in err_msg or "similar object exists in test mode" in err_msg:
                logger.warning("Stale Stripe customer %s for user %s — creating fresh customer and retrying", customer_id, row["id"])
                customer = stripe_lib.Customer.create(
                    email=row["email"],
                    metadata={"user_id": row["id"]},
                )
                customer_id = customer.id
                with get_connection() as conn:
                    conn.execute("UPDATE users SET stripe_customer_id=? WHERE id=?", (customer_id, row["id"]))
                    conn.commit()
                params = build_checkout_session_params(
                    customer_id=customer_id,
                    price_id=body.price_id,
                    success_url=success_url,
                    cancel_url=cancel_url,
                    user_id=row["id"],
                    trial_days=trial_days,
                    current_plan=current_plan,
                    db_row=row,
                    stripe_lib=stripe_lib,
                )
                session = stripe_lib.checkout.Session.create(**params)
            else:
                raise
    except stripe_lib.error.InvalidRequestError as e:
        logger.warning("Stripe InvalidRequestError in checkout: %s", e.user_message or str(e))
        raise HTTPException(400, f"Stripe rejected the request: {e.user_message or str(e)}")
    except stripe_lib.error.AuthenticationError as e:
        logger.error("Stripe AuthenticationError in checkout: %s", e)
        raise HTTPException(503, "Stripe authentication failed — check STRIPE_SECRET_KEY on the server.")
    except stripe_lib.error.StripeError as e:
        logger.exception("Stripe error in checkout: %s", e)
        raise HTTPException(502, f"Stripe error: {e.user_message or str(e)}")
    except Exception as e:
        logger.exception("Unexpected error in checkout: %s", e)
        raise HTTPException(500, f"Checkout setup failed: {type(e).__name__}: {e}")
    return {
        "checkout_url": session.url,
        "plan": mapped_plan or PRICE_ID_TO_PLAN.get(body.price_id),
    }


@router.post("/api/subscription/portal")
async def billing_portal(user: dict = Depends(require_active_plan)):
    from config import STRIPE_ENABLED, STRIPE_SECRET_KEY, APP_URL as _APP_URL
    if not STRIPE_ENABLED:
        raise HTTPException(503, "Stripe is not configured")
    try:
        import stripe as stripe_lib
        stripe_lib.api_key = STRIPE_SECRET_KEY
    except ImportError:
        raise HTTPException(503, "stripe package not installed")

    with get_connection() as conn:
        row = conn.execute(
            "SELECT stripe_customer_id FROM users WHERE id=?", (user["user_id"],)
        ).fetchone()
    if not row or not row["stripe_customer_id"]:
        raise HTTPException(400, "No billing account found. Please subscribe first.")

    frontend_url = os.getenv("FRONTEND_URL", _APP_URL)
    portal = stripe_lib.billing_portal.Session.create(
        customer=row["stripe_customer_id"],
        return_url=f"{frontend_url}/home",
    )
    return {"portal_url": portal.url}
@router.post("/api/voice/topup")
async def create_voice_topup_checkout(
    request: Request,
    user: dict = Depends(require_active_plan),
) -> dict:
    """
    Create a Stripe Checkout session for a one-time voice-minute top-up.

    Purchases 60 minutes for $6.00. On success Stripe sends a
    `checkout.session.completed` webhook which credits the minutes.

    Returns: {"checkout_url": "https://checkout.stripe.com/..."}
    """
    from config import STRIPE_ENABLED, STRIPE_SECRET_KEY
    from backend.deps import VOICE_TOPUP_MINUTES, VOICE_TOPUP_PRICE_CENTS

    if not STRIPE_ENABLED:
        raise HTTPException(503, "Stripe is not configured. Set STRIPE_SECRET_KEY in .env")
    try:
        import stripe as stripe_lib
        stripe_lib.api_key = STRIPE_SECRET_KEY
    except ImportError:
        raise HTTPException(503, "stripe package not installed. Run: pip install stripe")

    uid = user["user_id"]
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    if not row:
        raise HTTPException(404, "User not found")
    row = dict(row)
    plan_info = resolve_plan(row)
    if plan_info["plan"] != "premium_plus":
        raise HTTPException(
            403,
            "Voice minute top-ups are for Premium Plus. Premium includes speak-in via the chat mic; spoken replies require Premium Plus.",
        )

    frontend_url = os.getenv("FRONTEND_URL", os.getenv("APP_URL", "http://localhost:3000"))
    success_url = validate_stripe_return_url(
        f"{frontend_url}/home?voice_topup=success", "success_url"
    )
    cancel_url = validate_stripe_return_url(f"{frontend_url}/home", "cancel_url")

    try:
        customer_id = row.get("stripe_customer_id") or ""
        if not customer_id:
            customer = stripe_lib.Customer.create(
                email=row["email"],
                metadata={"user_id": uid},
            )
            customer_id = customer.id
            with get_connection() as conn:
                conn.execute(
                    "UPDATE users SET stripe_customer_id=? WHERE id=?", (customer_id, uid)
                )
                conn.commit()

        session = stripe_lib.checkout.Session.create(
            customer=customer_id,
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": "usd",
                    "unit_amount": VOICE_TOPUP_PRICE_CENTS,
                    "product_data": {
                        "name": f"{VOICE_TOPUP_MINUTES} Voice Minutes",
                        "description": (
                            f"Add {VOICE_TOPUP_MINUTES} voice minutes to your Orryon account. "
                            "Minutes are added instantly after payment."
                        ),
                    },
                },
                "quantity": 1,
            }],
            mode="payment",
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={
                "user_id": uid,
                "topup_type": "voice_topup",
                "minutes": str(VOICE_TOPUP_MINUTES),
            },
        )
    except Exception as exc:
        logger.exception("Voice topup checkout failed for user=%s: %s", uid, exc)
        raise HTTPException(502, "Could not create checkout session. Please try again.")

    return {"checkout_url": session.url}
