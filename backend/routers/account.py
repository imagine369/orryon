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

from backend.auth import _parse_device_name, create_token, get_current_user
from backend.cache import check_rate_limit_async
from backend.deps import IS_LOCAL_DEV, IS_PRODUCTION, MONTHLY_SPEND_CAP_USD, require_active_plan, resolve_plan
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
    get_monthly_spend,
    insert_row,
    record_token_spend,
    update_row,
    verify_code,
)
from email_sender import send_verification_code

logger = logging.getLogger(__name__)

router = APIRouter(tags=["account"])


# ── Settings ──────────────────────────────────────────────────────────────────

_SETTINGS_READ_FIELDS = {
    "id", "email", "display_name", "created_at", "plan", "trial_ends_at",
    "currency", "budget_cycle_start", "spending_alert_pct",
    "default_reminder_minutes", "daily_digest_enabled", "daily_digest_time",
    "weekly_report_enabled", "bill_due_alert_days",
}


@router.get("/api/settings")
async def get_settings(user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    if not row:
        raise HTTPException(404, "User not found")
    d = {k: v for k, v in dict(row).items() if k in _SETTINGS_READ_FIELDS}
    d["smtp_enabled"] = SMTP_ENABLED
    d["ai_connected"] = bool(XAI_API_KEY)
    d["grok_model"] = os.getenv("GROK_MODEL", "grok-3-mini")
    return d


# Explicit allowlist — prevents accidental exposure of columns we later add to
# the users table (e.g. stripe_customer_id, trial_ends_at) from being writable.
_SETTINGS_ALLOWED_FIELDS: set[str] = {
    "display_name",
    "default_reminder_minutes",
    "daily_digest_enabled",
    "daily_digest_time",
    "weekly_report_enabled",
    "bill_due_alert_days",
    "currency",
    "budget_cycle_start",
    "spending_alert_pct",
}


@router.patch("/api/settings")
async def update_settings(body: SettingsUpdate, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    raw = {k: v for k, v in body.model_dump().items() if v is not None}
    updates = {k: v for k, v in raw.items() if k in _SETTINGS_ALLOWED_FIELDS}
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
    with get_connection() as conn:
        existing = conn.execute(
            "SELECT id FROM users WHERE email=? AND id!=?", (new_email, user["user_id"])
        ).fetchone()
    if existing:
        raise HTTPException(400, "That email is already associated with another account")
    code = create_verification_code(new_email)
    result = send_verification_code(new_email, code)
    sent = result["sent"]
    return {
        "sent": sent,
        "dev_code": code if (not sent and IS_LOCAL_DEV) else "",
        "message": result["detail"] if not sent else f"Code sent to {new_email}",
    }


@router.post("/api/settings/email-change/verify")
async def email_change_verify(
    body: EmailChangeVerifyReq,
    request: Request,
    user: dict = Depends(get_current_user),
):
    new_email = body.new_email.strip().lower()
    if not verify_code(new_email, body.code.strip()):
        raise HTTPException(401, "Invalid or expired code")
    uid = user["user_id"]
    with get_connection() as conn:
        existing = conn.execute(
            "SELECT id FROM users WHERE email=? AND id!=?", (new_email, uid)
        ).fetchone()
    if existing:
        raise HTTPException(400, "That email is already in use")
    update_row("users", {"email": new_email}, {"id": uid})
    ua = request.headers.get("user-agent", "")
    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "")
    if ip and "," in ip:
        ip = ip.split(",")[0].strip()
    token = create_token(uid, new_email, device_name=_parse_device_name(ua), ip_address=ip)
    return {"token": token, "email": new_email}


# ── Account Deletion ──────────────────────────────────────────────────────────

@router.delete("/api/account")
async def delete_account(user: dict = Depends(get_current_user)):
    """Permanently delete all user data across every table."""
    uid = user["user_id"]
    user_data_tables = [
        "transactions", "accounts", "holdings", "goals", "notes", "events",
        "subscriptions", "credit_scores", "action_items", "links", "inspo_images",
        "budget_categories", "grocery_items", "custom_categories", "share_tokens",
        "user_memory", "recurring_income", "net_worth_snapshots", "link_pages",
        "chat_messages", "chat_sessions", "verification_codes",
        "user_calendar_tokens", "goal_contributions", "user_lists", "list_items",
    ]
    with get_connection() as conn:
        for table in user_data_tables:
            try:
                conn.execute(f"DELETE FROM {table} WHERE user_id=?", (uid,))
            except Exception:
                # Table may not exist in older schemas; ignore.
                pass
        # Delete any pending verification codes keyed by the user's email too.
        try:
            conn.execute(
                "DELETE FROM verification_codes WHERE email=(SELECT email FROM users WHERE id=?)",
                (uid,),
            )
        except Exception:
            pass
        conn.execute("DELETE FROM users WHERE id=?", (uid,))
        conn.commit()
    return {"deleted": True}


# ── Export ────────────────────────────────────────────────────────────────────

@router.get("/api/export")
async def export_data(user: dict = Depends(require_active_plan)):
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
async def create_share_link(user: dict = Depends(require_active_plan)):
    uid = user["user_id"]
    with get_connection() as conn:
        existing = conn.execute(
            "SELECT token FROM share_tokens WHERE user_id=? AND is_active=1 AND view_type='finance_readonly'",
            (uid,),
        ).fetchone()
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

    with get_connection() as conn:
        tok_row = conn.execute(
            "SELECT user_id FROM share_tokens WHERE token=? AND is_active=1 AND view_type='finance_readonly'",
            (token,),
        ).fetchone()
        if not tok_row:
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

    return {
        "balance": balance,
        "month_spend": float(month_row["total"]) if month_row else 0,
        "top_categories": [{"category": c["category"], "total": float(c["total"])} for c in cats],
    }


# ── Receipt Scanning ─────────────────────────────────────────────────────────

# Cap uploads at 5 MB (matches CSV import) and accept only common image types.
_RECEIPT_MAX_BYTES = 5 * 1024 * 1024
_RECEIPT_ALLOWED_MIME = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
}


@router.post("/api/receipts/scan")
async def scan_receipt(file: UploadFile = File(...), user: dict = Depends(require_active_plan)):
    """Use Grok Vision to extract structured data from a receipt image."""
    import base64
    import re as re_module
    import httpx

    uid = user["user_id"]

    # Rate limit: 10 scans per 10 min per user, 200/hour globally.
    if not await check_rate_limit_async(f"receipt:user:{uid}", limit=10, window_seconds=600):
        raise HTTPException(status_code=429, detail="Too many receipt scans — please wait a minute.")
    if not await check_rate_limit_async("receipt:global", limit=200, window_seconds=3600):
        logger.warning("Global receipt scan rate limit hit (user=%s).", uid)
        raise HTTPException(status_code=429, detail="Receipt scanning is temporarily paused — please try again soon.")

    # Budget gate — same check as chat so a user can't bypass monthly cap via vision.
    if get_monthly_spend(uid) >= MONTHLY_SPEND_CAP_USD:
        raise HTTPException(status_code=402, detail="You have reached your monthly usage limit. It resets on the 1st of next month.")

    mime = (file.content_type or "image/jpeg").lower()
    if mime not in _RECEIPT_ALLOWED_MIME:
        raise HTTPException(status_code=415, detail="Unsupported file type. Upload a JPG, PNG, WEBP, or HEIC image.")

    # Read with a hard cap; refuse anything larger.
    contents = await file.read(_RECEIPT_MAX_BYTES + 1)
    if len(contents) > _RECEIPT_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Receipt image is too large (max 5 MB).")
    if not contents:
        raise HTTPException(status_code=400, detail="Empty upload.")

    b64 = base64.b64encode(contents).decode("utf-8")

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

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post("https://api.x.ai/v1/chat/completions", headers=headers, json=payload)
    except httpx.TimeoutException:
        logger.warning("Receipt scan timed out for user=%s", uid)
        raise HTTPException(status_code=504, detail="Receipt scan timed out. Please try again.")
    except httpx.HTTPError as exc:
        logger.exception("Receipt scan network error for user=%s: %s", uid, exc)
        raise HTTPException(status_code=502, detail="Could not reach the receipt scanner right now.")

    if resp.status_code >= 400:
        # Never leak raw xAI errors to the client — just log server-side.
        logger.error("Receipt vision API error (status=%s) for user=%s: %s", resp.status_code, uid, resp.text[:500])
        raise HTTPException(status_code=502, detail="The receipt scanner couldn't process that image. Please try another photo.")

    try:
        body_json = resp.json()
    except Exception:
        logger.error("Receipt vision returned non-JSON for user=%s: %s", uid, resp.text[:500])
        raise HTTPException(status_code=502, detail="Receipt scanner returned an unexpected response.")

    # Meter token spend so vision calls count toward the monthly cap.
    try:
        usage = body_json.get("usage") or {}
        prompt_tokens = int(usage.get("prompt_tokens") or 0)
        completion_tokens = int(usage.get("completion_tokens") or 0)
        if prompt_tokens or completion_tokens:
            record_token_spend(uid, prompt_tokens, completion_tokens)
    except Exception as exc:
        logger.warning("Failed to record receipt scan token spend for user=%s: %s", uid, exc)

    try:
        raw = body_json["choices"][0]["message"]["content"].strip()
    except Exception:
        logger.error("Receipt vision response missing choices for user=%s: %s", uid, str(body_json)[:500])
        raise HTTPException(status_code=502, detail="Receipt scanner returned an unexpected response.")

    raw = re_module.sub(r"^```[a-z]*\n?", "", raw)
    raw = re_module.sub(r"\n?```$", "", raw)

    try:
        result = json.loads(raw)
    except Exception:
        logger.warning("Receipt vision returned unparseable JSON for user=%s: %s", uid, raw[:300])
        raise HTTPException(status_code=422, detail="Could not read the receipt — try a clearer photo.")

    return result


# ── Subscription / Billing ────────────────────────────────────────────────────

@router.get("/api/subscription")
async def get_subscription(user: dict = Depends(get_current_user)):
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE id=?", (user["user_id"],)).fetchone()
    if not row:
        raise HTTPException(404, "User not found")
    return resolve_plan(dict(row))


# Hosts we'll always trust for Stripe success/cancel redirects, in addition to
# whatever's configured via APP_URL / FRONTEND_URL. This keeps local dev and
# Vercel preview URLs working even when env vars point elsewhere — the real
# Orryon domain list lives in `_TRUSTED_STRIPE_HOST_SUFFIXES` below.
_TRUSTED_STRIPE_HOSTS = {"localhost", "127.0.0.1"}
_TRUSTED_STRIPE_HOST_SUFFIXES = (".orryon.com",)
_TRUSTED_STRIPE_HOST_PATTERNS = ("orryon",)  # only orryon*.vercel.app, not arbitrary


def _validate_stripe_return_url(url: str, field: str) -> str:
    """Allow only URLs that belong to our own app/frontend.

    Stripe uses the success_url/cancel_url verbatim, so without this guard the
    endpoint becomes an open-redirect primitive. We accept:

      * Any URL whose origin matches APP_URL / FRONTEND_URL / config.APP_URL
      * Any URL whose host is localhost or 127.0.0.1 (dev)
      * Any URL whose host ends in `.orryon.com` or `.vercel.app` (prod + preview)
    """
    from urllib.parse import urlparse

    if not url:
        raise HTTPException(400, f"{field} is required")
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(400, f"{field} must be an absolute http(s) URL")

    host = parsed.hostname or ""
    if host in _TRUSTED_STRIPE_HOSTS:
        return url
    if any(host == s.lstrip(".") or host.endswith(s) for s in _TRUSTED_STRIPE_HOST_SUFFIXES):
        return url
    if host.endswith(".vercel.app") and any(host.startswith(p) for p in _TRUSTED_STRIPE_HOST_PATTERNS):
        return url

    allowed: list[str] = []
    for val in (os.getenv("APP_URL", ""), os.getenv("FRONTEND_URL", ""), APP_URL):
        if val:
            allowed.append(val.rstrip("/"))

    base = f"{parsed.scheme}://{parsed.netloc}".rstrip("/")
    if any(base == a.rstrip("/") or base.startswith(a.rstrip("/") + "/") for a in allowed):
        return url
    allowed_hosts = {urlparse(a).netloc for a in allowed if a}
    if parsed.netloc in allowed_hosts:
        return url

    raise HTTPException(400, f"{field} points to an untrusted host")


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

    success_url = _validate_stripe_return_url(body.success_url, "success_url")
    cancel_url = _validate_stripe_return_url(body.cancel_url, "cancel_url")

    with get_connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE id=?", (user["user_id"],)).fetchone()
    if not row:
        raise HTTPException(404, "User not found")
    row = dict(row)

    try:
        customer_id = row.get("stripe_customer_id") or ""
        if not customer_id:
            customer = stripe_lib.Customer.create(
                email=row["email"],
                metadata={"user_id": row["id"]},
            )
            customer_id = customer.id
            with get_connection() as conn:
                conn.execute("UPDATE users SET stripe_customer_id=? WHERE id=?", (customer_id, row["id"]))
                conn.commit()

        current_plan = resolve_plan(row)
        trial_days = get_trial_days(body.price_id)
        checkout_params: dict[str, Any] = {
            "customer": customer_id,
            "payment_method_types": ["card"],
            "line_items": [{"price": body.price_id, "quantity": 1}],
            "mode": "subscription",
            "success_url": success_url,
            "cancel_url": cancel_url,
            "metadata": {"user_id": row["id"]},
        }
        is_free_breathe = row.get("segment") == "free_breathe"
        if trial_days and current_plan["plan"] in ("trial", "free") and not row.get("stripe_subscription_id") and not is_free_breathe:
            effective_trial = (
                max(current_plan.get("trial_days_remaining", 0), 1)
                if current_plan["plan"] == "trial"
                else trial_days
            )
            checkout_params["subscription_data"] = {"trial_period_days": effective_trial}
        session = stripe_lib.checkout.Session.create(**checkout_params)
    except stripe_lib.error.InvalidRequestError as e:
        # Bad price ID, test/live-mode mismatch, malformed params, etc.
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
    return {"checkout_url": session.url}


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

    event_id = event.get("id", "")
    if event_id:
        from backend.cache import check_rate_limit_async
        already_processed = not await check_rate_limit_async(
            f"stripe_event:{event_id}", limit=1, window_seconds=86400
        )
        if already_processed:
            logger.info("Skipping duplicate Stripe event %s", event_id)
            return {"received": True}

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        user_id = session.get("metadata", {}).get("user_id")
        sub_id = session.get("subscription")
        if user_id and sub_id:
            with get_connection() as conn:
                conn.execute(
                    "UPDATE users SET plan='pro', stripe_subscription_id=?, trial_ends_at='' WHERE id=?",
                    (sub_id, user_id),
                )
                conn.commit()

    elif event["type"] in ("customer.subscription.deleted", "customer.subscription.paused"):
        sub = event["data"]["object"]
        sub_id = sub.get("id")
        if sub_id:
            with get_connection() as conn:
                conn.execute(
                    "UPDATE users SET plan='free', stripe_subscription_id='' WHERE stripe_subscription_id=?",
                    (sub_id,),
                )
                conn.commit()

    elif event["type"] == "customer.subscription.updated":
        sub = event["data"]["object"]
        sub_id = sub.get("id")
        status = sub.get("status")
        if sub_id and status:
            new_plan = "pro" if status in ("active", "trialing", "past_due") else "free"
            with get_connection() as conn:
                conn.execute(
                    "UPDATE users SET plan=? WHERE stripe_subscription_id=?",
                    (new_plan, sub_id),
                )
                conn.commit()

    elif event["type"] == "invoice.payment_failed":
        invoice = event["data"]["object"]
        customer_id = invoice.get("customer", "")
        attempt = invoice.get("attempt_count", 0)
        logger.warning("Payment failed for customer %s (attempt %d)", customer_id, attempt)

    return {"received": True}
