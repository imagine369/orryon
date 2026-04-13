"""
backend/routers/account.py — Account management, billing, and data portability.

Covers user settings, email change flow, account deletion, data export,
share links, subscription management (Stripe), receipt scanning, and
the Stripe webhook handler.
"""

from __future__ import annotations

import json
import logging
import os
import secrets
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import Response

from backend.auth import create_token, get_current_user
from backend.deps import IS_PRODUCTION, resolve_plan
from backend.schemas import (
    CheckoutReq,
    EmailChangeSendReq,
    EmailChangeVerifyReq,
    SettingsUpdate,
)
from config import APP_URL, SMTP_ENABLED, XAI_API_KEY
from db import (
    create_verification_code,
    get_connection,
    insert_row,
    update_row,
    verify_code,
)
from email_sender import send_verification_code

logger = logging.getLogger(__name__)

router = APIRouter(tags=["account"])


# ── Settings ──────────────────────────────────────────────────────────────────

@router.get("/api/settings")
async def get_settings(user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    conn = get_connection()
    row = conn.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "User not found")
    d = dict(row)
    d["smtp_enabled"] = SMTP_ENABLED
    d["ai_connected"] = bool(XAI_API_KEY)
    d["grok_model"] = os.getenv("GROK_MODEL", "grok-3-mini")
    return d


@router.patch("/api/settings")
async def update_settings(body: SettingsUpdate, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")
    update_row("users", updates, {"id": uid})
    return {"updated": True}


# ── Email Change ──────────────────────────────────────────────────────────────

@router.post("/api/settings/email-change/send-code")
async def email_change_send_code(body: EmailChangeSendReq, user: dict = Depends(get_current_user)):
    new_email = body.new_email.strip().lower()
    if not new_email or "@" not in new_email:
        raise HTTPException(400, "Invalid email address")
    conn = get_connection()
    existing = conn.execute(
        "SELECT id FROM users WHERE email=? AND id!=?", (new_email, user["user_id"])
    ).fetchone()
    conn.close()
    if existing:
        raise HTTPException(400, "That email is already associated with another account")
    code = create_verification_code(new_email)
    result = send_verification_code(new_email, code)
    sent = result["sent"]
    return {
        "sent": sent,
        "dev_code": code if (not sent and not IS_PRODUCTION) else "",
        "message": result["detail"] if not sent else f"Code sent to {new_email}",
    }


@router.post("/api/settings/email-change/verify")
async def email_change_verify(body: EmailChangeVerifyReq, user: dict = Depends(get_current_user)):
    new_email = body.new_email.strip().lower()
    if not verify_code(new_email, body.code.strip()):
        raise HTTPException(401, "Invalid or expired code")
    uid = user["user_id"]
    conn = get_connection()
    existing = conn.execute(
        "SELECT id FROM users WHERE email=? AND id!=?", (new_email, uid)
    ).fetchone()
    conn.close()
    if existing:
        raise HTTPException(400, "That email is already in use")
    update_row("users", {"email": new_email}, {"id": uid})
    token = create_token(uid, new_email)
    return {"token": token, "email": new_email}


# ── Account Deletion ──────────────────────────────────────────────────────────

@router.delete("/api/account")
async def delete_account(user: dict = Depends(get_current_user)):
    """Permanently delete all user data across every table."""
    uid = user["user_id"]
    conn = get_connection()
    user_data_tables = [
        "transactions", "accounts", "holdings", "goals", "notes", "events",
        "subscriptions", "credit_scores", "action_items", "links", "inspo_images",
        "budget_categories", "grocery_items", "custom_categories", "share_tokens",
        "user_memory", "recurring_income", "net_worth_snapshots", "link_pages",
        "chat_messages",
    ]
    for table in user_data_tables:
        try:
            conn.execute(f"DELETE FROM {table} WHERE user_id=?", (uid,))
        except Exception:
            pass
    conn.execute("DELETE FROM users WHERE id=?", (uid,))
    conn.commit()
    conn.close()
    return {"deleted": True}


# ── Export ────────────────────────────────────────────────────────────────────

@router.get("/api/export")
async def export_data(user: dict = Depends(get_current_user)):
    """Download all user data as a ZIP file containing the SQLite DB and JSON."""
    from core.export import build_user_export_zip

    zip_bytes = build_user_export_zip(user["user_id"])
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=orryon_export.zip"},
    )


# ── Share ─────────────────────────────────────────────────────────────────────

@router.post("/api/share")
async def create_share_link(user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    conn = get_connection()
    existing = conn.execute(
        "SELECT token FROM share_tokens WHERE user_id=? AND is_active=1 AND view_type='finance_readonly'",
        (uid,),
    ).fetchone()
    conn.close()
    if existing:
        return {"token": existing["token"], "url": f"{APP_URL}?share_token={existing['token']}"}
    token = secrets.token_urlsafe(16)
    insert_row("share_tokens", {
        "id": str(uuid.uuid4()), "user_id": uid, "token": token,
        "view_type": "finance_readonly", "is_active": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"token": token, "url": f"{APP_URL}?share_token={token}"}


@router.get("/api/share/{token}")
async def get_shared_dashboard(token: str):
    """Public endpoint — no auth required. Returns a read-only dashboard snapshot."""
    from datetime import date
    from db import get_balance

    conn = get_connection()
    tok_row = conn.execute(
        "SELECT user_id FROM share_tokens WHERE token=? AND is_active=1 AND view_type='finance_readonly'",
        (token,),
    ).fetchone()
    if not tok_row:
        conn.close()
        raise HTTPException(404, "Invalid or expired share link")
    uid = tok_row["user_id"]
    today = date.today()
    month_start = today.replace(day=1).isoformat()

    balance = get_balance(uid)
    month_row = conn.execute(
        "SELECT COALESCE(SUM(amount),0) as total FROM transactions "
        "WHERE user_id=? AND date>=? AND amount>0", (uid, month_start),
    ).fetchone()
    cats = conn.execute(
        "SELECT category, SUM(amount) as total FROM transactions "
        "WHERE user_id=? AND date>=? AND amount>0 GROUP BY category ORDER BY total DESC LIMIT 5",
        (uid, month_start),
    ).fetchall()
    conn.close()

    return {
        "balance": balance,
        "month_spend": float(month_row["total"]) if month_row else 0,
        "top_categories": [{"category": c["category"], "total": float(c["total"])} for c in cats],
    }


# ── Receipt Scanning ─────────────────────────────────────────────────────────

@router.post("/api/receipts/scan")
async def scan_receipt(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    """Use Grok Vision to extract structured data from a receipt image."""
    import base64
    import re as re_module
    import requests as req_lib

    contents = await file.read()
    b64 = base64.b64encode(contents).decode("utf-8")
    mime = file.content_type or "image/jpeg"

    payload = {
        "model": "grok-2-vision-1212",
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{mime};base64,{b64}"},
                    },
                    {
                        "type": "text",
                        "text": (
                            "This is a receipt image. Extract the following and respond ONLY with valid JSON, no markdown:\n"
                            '{"merchant": "store name", "amount": 12.34, "date": "YYYY-MM-DD", "category": "one of: Food & Dining, Groceries, Transport, Entertainment, Shopping, Health & Fitness, Utilities, Travel, Subscriptions, Personal Care, Education, Other", "items": ["item1", "item2"]}\n'
                            "If you cannot determine a field, use null. Amount must be a number (total paid). Date must be YYYY-MM-DD format."
                        ),
                    },
                ],
            }
        ],
        "max_tokens": 300,
        "temperature": 0,
    }

    headers = {
        "Authorization": f"Bearer {XAI_API_KEY}",
        "Content-Type": "application/json",
    }

    resp = req_lib.post("https://api.x.ai/v1/chat/completions", headers=headers, json=payload, timeout=30)

    if not resp.ok:
        raise HTTPException(500, f"Vision API error: {resp.text}")

    raw = resp.json()["choices"][0]["message"]["content"].strip()
    raw = re_module.sub(r"^```[a-z]*\n?", "", raw)
    raw = re_module.sub(r"\n?```$", "", raw)

    try:
        result = json.loads(raw)
    except Exception:
        raise HTTPException(500, "Could not parse receipt data from image")

    return result


# ── Subscription / Billing ────────────────────────────────────────────────────

@router.get("/api/subscription")
async def get_subscription(user: dict = Depends(get_current_user)):
    conn = get_connection()
    row = conn.execute("SELECT * FROM users WHERE id=?", (user["user_id"],)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "User not found")
    return resolve_plan(dict(row))


@router.post("/api/subscription/checkout")
async def create_checkout(body: CheckoutReq, user: dict = Depends(get_current_user)):
    from config import STRIPE_ENABLED, STRIPE_SECRET_KEY, ALLOWED_STRIPE_PRICES, get_trial_days
    if not STRIPE_ENABLED:
        raise HTTPException(503, "Stripe is not configured. Set STRIPE_SECRET_KEY in .env")
    if ALLOWED_STRIPE_PRICES and body.price_id not in ALLOWED_STRIPE_PRICES:
        raise HTTPException(400, "Invalid price ID")
    try:
        import stripe as stripe_lib
        stripe_lib.api_key = STRIPE_SECRET_KEY
    except ImportError:
        raise HTTPException(503, "stripe package not installed. Run: pip install stripe")

    conn = get_connection()
    row = conn.execute("SELECT * FROM users WHERE id=?", (user["user_id"],)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "User not found")
    row = dict(row)

    customer_id = row.get("stripe_customer_id") or ""
    if not customer_id:
        customer = stripe_lib.Customer.create(
            email=row["email"],
            metadata={"user_id": row["id"]},
        )
        customer_id = customer.id
        conn = get_connection()
        conn.execute("UPDATE users SET stripe_customer_id=? WHERE id=?", (customer_id, row["id"]))
        conn.commit()
        conn.close()

    current_plan = resolve_plan(row)
    trial_days = get_trial_days(body.price_id)
    checkout_params: dict[str, Any] = {
        "customer": customer_id,
        "payment_method_types": ["card"],
        "line_items": [{"price": body.price_id, "quantity": 1}],
        "mode": "subscription",
        "success_url": body.success_url,
        "cancel_url": body.cancel_url,
        "metadata": {"user_id": row["id"]},
    }
    if trial_days and current_plan["plan"] in ("trial", "free") and not row.get("stripe_subscription_id"):
        effective_trial = (
            max(current_plan.get("trial_days_remaining", 0), 1)
            if current_plan["plan"] == "trial"
            else trial_days
        )
        checkout_params["subscription_data"] = {"trial_period_days": effective_trial}
    session = stripe_lib.checkout.Session.create(**checkout_params)
    return {"checkout_url": session.url}


@router.post("/api/subscription/portal")
async def billing_portal(user: dict = Depends(get_current_user)):
    from config import STRIPE_ENABLED, STRIPE_SECRET_KEY, APP_URL as _APP_URL
    if not STRIPE_ENABLED:
        raise HTTPException(503, "Stripe is not configured")
    try:
        import stripe as stripe_lib
        stripe_lib.api_key = STRIPE_SECRET_KEY
    except ImportError:
        raise HTTPException(503, "stripe package not installed")

    conn = get_connection()
    row = conn.execute("SELECT stripe_customer_id FROM users WHERE id=?", (user["user_id"],)).fetchone()
    conn.close()
    if not row or not row["stripe_customer_id"]:
        raise HTTPException(400, "No billing account found. Please subscribe first.")

    frontend_url = os.getenv("FRONTEND_URL", _APP_URL)
    portal = stripe_lib.billing_portal.Session.create(
        customer=row["stripe_customer_id"],
        return_url=f"{frontend_url}/home",
    )
    return {"portal_url": portal.url}


@router.post("/api/stripe/webhook")
async def stripe_webhook(request: Request):
    """Stripe webhook handler — no auth required (validated via Stripe signature)."""
    from config import STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
    try:
        import stripe as stripe_lib
        stripe_lib.api_key = STRIPE_SECRET_KEY
    except ImportError:
        raise HTTPException(503, "stripe package not installed")

    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        event = stripe_lib.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
    except stripe_lib.errors.SignatureVerificationError:
        raise HTTPException(400, "Invalid Stripe signature")

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        user_id = session.get("metadata", {}).get("user_id")
        sub_id = session.get("subscription")
        if user_id and sub_id:
            conn = get_connection()
            conn.execute(
                "UPDATE users SET plan='pro', stripe_subscription_id=?, trial_ends_at='' WHERE id=?",
                (sub_id, user_id),
            )
            conn.commit()
            conn.close()

    elif event["type"] in ("customer.subscription.deleted", "customer.subscription.paused"):
        sub = event["data"]["object"]
        sub_id = sub.get("id")
        if sub_id:
            conn = get_connection()
            conn.execute(
                "UPDATE users SET plan='free', stripe_subscription_id='' WHERE stripe_subscription_id=?",
                (sub_id,),
            )
            conn.commit()
            conn.close()

    elif event["type"] == "customer.subscription.updated":
        sub = event["data"]["object"]
        sub_id = sub.get("id")
        status = sub.get("status")
        if sub_id and status:
            new_plan = "pro" if status in ("active", "trialing", "past_due") else "free"
            conn = get_connection()
            conn.execute(
                "UPDATE users SET plan=? WHERE stripe_subscription_id=?",
                (new_plan, sub_id),
            )
            conn.commit()
            conn.close()

    elif event["type"] == "invoice.payment_failed":
        invoice = event["data"]["object"]
        customer_id = invoice.get("customer", "")
        attempt = invoice.get("attempt_count", 0)
        logger.warning("Payment failed for customer %s (attempt %d)", customer_id, attempt)

    return {"received": True}
