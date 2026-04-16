"""
backend/routers/auth.py — Authentication endpoints.

Handles OTP email sign-in, demo mode, JWT issuance, and signup checkout.
The Next.js frontend calls these to authenticate users before accessing
protected API routes.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request

from backend.auth import create_token, get_current_user
from backend.deps import IS_PRODUCTION, check_otp_rate_limit
from backend.schemas import AuthRes, SendCodeReq, SignupCheckoutReq, VerifyReq
from db import (
    create_verification_code,
    fetch_rows,
    get_connection,
    get_or_create_user_by_email,
    update_row,
    verify_code,
)
from email_sender import send_verification_code

logger = logging.getLogger(__name__)

router = APIRouter(tags=["auth"])


@router.post("/api/auth/send-code")
async def auth_send_code(body: SendCodeReq, request: Request):
    """
    Send an OTP verification code to the given email address.
    Blocks unapproved emails during beta (invite-only).
    """
    email = body.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(400, "Invalid email address")

    from config import CONTACT_EMAIL
    admin_email = (CONTACT_EMAIL or "").strip().lower()
    is_admin = admin_email and email == admin_email

    if not is_admin:
        conn = get_connection()
        wl = conn.execute(
            "SELECT approved FROM waitlist WHERE email = ?", (email,)
        ).fetchone()
        conn.close()

        if not wl:
            raise HTTPException(
                403,
                "This email isn't on the waitlist yet. "
                "Join at www.orryon.com to request early access.",
            )
        if not wl["approved"]:
            raise HTTPException(
                403,
                "You're on the waitlist! We'll email you when your access is ready.",
            )

    check_otp_rate_limit(request, email)

    code = create_verification_code(email)
    result = send_verification_code(email, code)
    sent = result["sent"]
    reason = result["reason"]

    show_dev_code = not sent and not IS_PRODUCTION
    if not sent and reason != "not_configured":
        logger.warning("OTP email to %s failed (reason: %s): %s", email, reason, result["detail"])

    return {
        "sent": sent,
        "dev_code": code if show_dev_code else "",
        "smtp_configured": reason != "not_configured",
        "message": result["detail"] if not sent else f"Code sent to {email}",
    }


@router.post("/api/auth/verify", response_model=AuthRes)
async def auth_verify(body: VerifyReq):
    """Verify OTP code, create/fetch user, issue JWT. Seeds demo data for new users."""
    email = body.email.strip().lower()
    if not verify_code(email, body.code.strip()):
        raise HTTPException(401, "Invalid or expired code")
    display_name = (body.display_name or "").strip()
    user = get_or_create_user_by_email(email, display_name=display_name)
    if display_name and user.get("display_name") != display_name:
        update_row("users", {"display_name": display_name}, {"id": user["id"]})
        user["display_name"] = display_name
    existing_txns = fetch_rows("transactions", {"user_id": user["id"]})
    if not existing_txns:
        from core.tools import seed_sample_data
        seed_sample_data(user["id"])
    token = create_token(user["id"], email)
    return {"token": token, "user": user}


@router.post("/api/auth/signup-checkout")
async def signup_checkout(body: SignupCheckoutReq, user: dict = Depends(get_current_user)):
    """Create a Stripe Checkout session with a trial as part of signup flow."""
    from config import STRIPE_ENABLED, STRIPE_SECRET_KEY, ALLOWED_STRIPE_PRICES, get_trial_days
    if not STRIPE_ENABLED:
        raise HTTPException(503, "Stripe is not configured. Set STRIPE_SECRET_KEY in .env")
    if ALLOWED_STRIPE_PRICES and body.price_id not in ALLOWED_STRIPE_PRICES:
        raise HTTPException(400, "Invalid price ID")
    try:
        import stripe as stripe_lib
        stripe_lib.api_key = STRIPE_SECRET_KEY
    except ImportError:
        raise HTTPException(503, "stripe package not installed")

    conn = get_connection()
    row = conn.execute("SELECT * FROM users WHERE id=?", (user["user_id"],)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "User not found")
    row = dict(row)

    if row.get("stripe_subscription_id"):
        raise HTTPException(400, "You already have an active subscription")

    customer_id = row.get("stripe_customer_id") or ""
    if not customer_id:
        customer = stripe_lib.Customer.create(
            email=row["email"],
            name=row.get("display_name") or "",
            metadata={"user_id": row["id"]},
        )
        customer_id = customer.id
        conn = get_connection()
        conn.execute("UPDATE users SET stripe_customer_id=? WHERE id=?", (customer_id, row["id"]))
        conn.commit()
        conn.close()

    trial_days = get_trial_days(body.price_id)
    checkout_params: dict = {
        "customer": customer_id,
        "payment_method_types": ["card"],
        "line_items": [{"price": body.price_id, "quantity": 1}],
        "mode": "subscription",
        "success_url": body.success_url,
        "cancel_url": body.cancel_url,
        "metadata": {"user_id": row["id"]},
    }
    if trial_days:
        checkout_params["subscription_data"] = {"trial_period_days": trial_days}
    session = stripe_lib.checkout.Session.create(**checkout_params)
    return {"checkout_url": session.url}


@router.post("/api/auth/demo", response_model=AuthRes)
async def auth_demo():
    """Issue a demo JWT for local development (disabled in production)."""
    if IS_PRODUCTION:
        raise HTTPException(403, "Demo mode is disabled in production")
    email = "demo@orryon.app"
    user = get_or_create_user_by_email(email)
    existing_txns = fetch_rows("transactions", {"user_id": user["id"]})
    if not existing_txns:
        from core.tools import seed_sample_data
        seed_sample_data(user["id"])
    token = create_token(user["id"], email)
    return {"token": token, "user": user}


@router.get("/api/auth/me")
async def auth_me(user: dict = Depends(get_current_user)):
    """Return the authenticated user's full profile."""
    conn = get_connection()
    row = conn.execute("SELECT * FROM users WHERE id=?", (user["user_id"],)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "User not found")
    return dict(row)
