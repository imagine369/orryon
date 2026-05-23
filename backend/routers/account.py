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
from pydantic import BaseModel

from backend.auth import _parse_device_name, create_token, get_current_user
from backend.cache import check_rate_limit_async
from backend.deps import (
    IS_LOCAL_DEV,
    IS_PRODUCTION,
    check_monthly_api_quota,
    require_active_plan,
    resolve_plan,
    resolve_plan_for_user,
    get_monthly_spend_cap,
    get_monthly_token_cap,
)
from backend.schemas import (
    CheckoutReq,
    EmailChangeSendReq,
    EmailChangeVerifyReq,
    SettingsUpdate,
)
from config import APP_URL, GROK_MODEL, SMTP_ENABLED, XAI_API_KEY
from core.display_name import normalize_display_name
from db import (
    create_verification_code,
    get_connection,
    get_monthly_spend,
    get_user_preferences,
    upsert_user_preferences,
    get_chat_message_count,
    insert_row,
    record_token_spend,
    update_row,
    verify_code,
)
from email_sender import send_verification_code, _send_email, orryon_email_header_html

logger = logging.getLogger(__name__)

router = APIRouter(tags=["account"])


# ─────────────────────────────────────────────────────────────────────────────
# Stripe helpers — production-ready, lifetime-trial guard
# ─────────────────────────────────────────────────────────────────────────────

def _get_or_create_stripe_customer(
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


def _customer_has_prior_subscription_for_price(
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


def _build_checkout_session_params(
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
        had_previous = _customer_has_prior_subscription_for_price(stripe_lib, customer_id, price_id)
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


# ── Settings ──────────────────────────────────────────────────────────────────

_SETTINGS_READ_FIELDS = {
    "id", "email", "display_name", "created_at", "plan", "trial_ends_at",
    "phone", "country", "language", "birth_date", "gender",
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
    if d.get("display_name"):
        d["display_name"] = normalize_display_name(d["display_name"])
    d["smtp_enabled"] = SMTP_ENABLED
    d["ai_connected"] = bool(XAI_API_KEY)
    d["grok_model"] = GROK_MODEL
    return d


# Explicit allowlist — prevents accidental exposure of columns we later add to
# the users table (e.g. stripe_customer_id, trial_ends_at) from being writable.
_SETTINGS_ALLOWED_FIELDS: set[str] = {
    "display_name",
    "phone",
    "country",
    "language",
    "birth_date",
    "gender",
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
    if "display_name" in updates and isinstance(updates["display_name"], str):
        updates["display_name"] = normalize_display_name(updates["display_name"])
        if not updates["display_name"]:
            raise HTTPException(400, "Display name cannot be empty")
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

    plan_info = resolve_plan_for_user(uid)
    check_monthly_api_quota(uid, plan_info["plan"])

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
        "model": GROK_MODEL,
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

def _subscription_payload(user_row: dict) -> dict:
    """API shape for /api/subscription — includes Stripe linkage for post-checkout polling."""
    payload = resolve_plan(user_row)
    payload["has_stripe_subscription"] = bool(
        (user_row.get("stripe_subscription_id") or "").strip()
    )
    return payload


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


_PLAN_RANK = {"premium_plus": 3, "premium": 2, "pro": 1}


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


def _sync_user_plan_from_stripe(stripe_lib: Any, user_row: dict) -> dict:
    """Pull active subscription from Stripe and persist plan (webhook fallback)."""
    user_id = user_row.get("id")
    customer_ids, user_row = _all_stripe_customer_ids(stripe_lib, user_row)

    if not customer_ids:
        logger.info("subscription sync: no Stripe customer for user %s", user_id)
        out = _subscription_payload(user_row)
        out["sync_message"] = "No Stripe customer found for your login email."
        return out

    found = _find_paid_subscription(stripe_lib, customer_ids, user_id)
    if not found:
        logger.info("subscription sync: no paid subscription for user %s customers=%s", user_id, customer_ids)
        out = _subscription_payload(user_row)
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
    out = _subscription_payload(updated)
    out["sync_message"] = f"Restored {new_plan} from Stripe."
    out["synced"] = True
    return out


@router.get("/api/subscription")
async def get_subscription(user: dict = Depends(get_current_user)):
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE id=?", (user["user_id"],)).fetchone()
    if not row:
        raise HTTPException(404, "User not found")
    row = dict(row)
    resolved = resolve_plan(row)
    needs_reconcile = resolved["plan"] in ("free", "trial")
    if needs_reconcile:
        from config import STRIPE_ENABLED, STRIPE_SECRET_KEY

        if STRIPE_ENABLED:
            try:
                import stripe as stripe_lib

                stripe_lib.api_key = STRIPE_SECRET_KEY
                return _sync_user_plan_from_stripe(stripe_lib, row)
            except Exception as e:
                logger.warning("subscription reconcile on GET failed for %s: %s", row.get("id"), e)
    return _subscription_payload(row)


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
    return _sync_user_plan_from_stripe(stripe_lib, dict(row))


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

    success_url = _validate_stripe_return_url(body.success_url, "success_url")
    cancel_url = _validate_stripe_return_url(body.cancel_url, "cancel_url")

    with get_connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE id=?", (user["user_id"],)).fetchone()
    if not row:
        raise HTTPException(404, "User not found")
    row = dict(row)

    try:
        # 1. Customer creation / retrieval (with reuse by email)
        customer_id, is_new = _get_or_create_stripe_customer(
            stripe_lib, row["email"], row["id"], row.get("stripe_customer_id")
        )
        if is_new:
            with get_connection() as conn:
                conn.execute("UPDATE users SET stripe_customer_id=? WHERE id=?", (customer_id, row["id"]))
                conn.commit()

        current_plan = resolve_plan(row)
        trial_days = get_trial_days(body.price_id)

        # 2. Build Checkout Session params (applies lifetime trial guard)
        params = _build_checkout_session_params(
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
                params = _build_checkout_session_params(
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


# ── Voice Top-up ──────────────────────────────────────────────────────────────

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
    success_url = _validate_stripe_return_url(
        f"{frontend_url}/home?voice_topup=success", "success_url"
    )
    cancel_url = _validate_stripe_return_url(f"{frontend_url}/home", "cancel_url")

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


def _notify_admin_new_subscriber(email: str, plan: str, billing_interval: str) -> None:
    """Fire-and-forget email to admin when a paid subscription checkout completes."""
    import html as _html
    from config import CONTACT_EMAIL, SMTP_FROM, SMTP_USER
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText

    admin = (CONTACT_EMAIL or "").strip()
    if not admin:
        return

    plan_labels = {
        "pro":          ("Pro",          "$22/mo or $198/yr"),
        "premium":      ("Premium",      "$33/mo or $297/yr"),
        "premium_plus": ("Premium Plus", "$44/mo or $396/yr"),
    }
    plan_name, plan_price = plan_labels.get(plan, (plan.title(), ""))
    interval_label = billing_interval.capitalize() if billing_interval else "Subscription"

    safe_email = _html.escape(email, quote=True)

    plain = (
        f"💳 New Paying Customer\n\n"
        f"Email:    {email}\n"
        f"Plan:     {plan_name} ({interval_label})\n"
        f"Price:    {plan_price}\n\n"
        "— orryon"
    )
    html = f"""<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
             background:#000;color:#fff;margin:0;padding:0;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="420" cellpadding="0" cellspacing="0"
               style="background:#111;border-radius:16px;padding:40px;">
          {orryon_email_header_html()}
          <tr>
            <td align="center" style="padding-bottom:8px;">
              <p style="margin:0;font-size:14px;font-weight:600;letter-spacing:1px;
                        text-transform:uppercase;color:#92fe9d;">💳 New Paying Customer</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:14px 0 8px;">
              <span style="font-size:20px;font-weight:700;color:#fff;">{safe_email}</span>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:20px;">
              <div style="background:#0f2027;border:1px solid rgba(146,254,157,0.25);
                          border-radius:12px;padding:16px 24px;display:inline-block;margin-top:8px;">
                <span style="font-size:22px;font-weight:800;color:#92fe9d;">{plan_name}</span>
                <span style="display:block;font-size:13px;color:#64748b;margin-top:4px;">
                  {interval_label} · {plan_price}
                </span>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"💳 New subscriber — {email} ({plan_name})"
    msg["From"]    = SMTP_FROM or SMTP_USER or admin
    msg["To"]      = admin
    msg.attach(MIMEText(plain, "plain"))
    msg.attach(MIMEText(html, "html"))

    try:
        ok, _ = _send_email(admin, msg)
        if ok:
            logger.info("Admin notified of new subscriber: %s plan=%s", email, plan)
        else:
            logger.warning("Failed to notify admin of new subscriber: %s", email)
    except Exception as exc:
        logger.warning("Admin subscriber notification error for %s: %s", email, exc)


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
        meta = session.get("metadata", {})
        user_id = meta.get("user_id")
        topup_type = meta.get("topup_type")

        if topup_type == "voice_topup" and user_id:
            # One-time voice minute top-up
            from db import add_voice_topup
            from backend.deps import VOICE_TOPUP_PRICE_USD
            minutes = int(meta.get("minutes", 60))
            pi_id = session.get("payment_intent", "")
            add_voice_topup(user_id, minutes, VOICE_TOPUP_PRICE_USD, pi_id or "")
            logger.info("Voice topup: +%d min for user=%s (pi=%s)", minutes, user_id, pi_id)

        else:
            # Regular subscription checkout — look up which tier was purchased
            sub_id = session.get("subscription")
            if isinstance(sub_id, dict):
                sub_id = sub_id.get("id")
            if user_id and sub_id:
                from config import PRICE_ID_TO_PLAN
                price_id = (meta.get("price_id") or "").strip()
                new_plan = PRICE_ID_TO_PLAN.get(price_id)

                # If metadata price_id isn't in our map (stale .env, wrong deploy),
                # read the live subscription from Stripe so Premium isn't stored as pro.
                if new_plan is None:
                    try:
                        sub_obj = stripe_lib.Subscription.retrieve(str(sub_id))
                        items = sub_obj.get("items", {}).get("data", [])
                        if items:
                            p = items[0].get("price") or {}
                            resolved = (p.get("id") or "").strip()
                            if resolved:
                                price_id = resolved
                                new_plan = PRICE_ID_TO_PLAN.get(price_id)
                    except Exception as e:
                        logger.warning(
                            "checkout.session.completed: could not retrieve subscription %s: %s",
                            sub_id,
                            e,
                        )

                if new_plan is None:
                    new_plan = "pro"
                    logger.warning(
                        "checkout.session.completed: unknown price_id=%r user=%s sub=%s — defaulting to pro",
                        price_id,
                        user_id,
                        sub_id,
                    )

                _cfg = __import__("config")
                billing_interval = "annual" if price_id in (
                    _cfg.STRIPE_PRICE_PRO_ANNUAL,
                    _cfg.STRIPE_PRICE_PREMIUM_ANNUAL,
                    _cfg.STRIPE_PRICE_PREMIUM_PLUS_ANNUAL,
                ) else "monthly"
                bps, bpe = "", ""
                try:
                    from core.usage_period import stripe_subscription_period_bounds

                    sub_obj = stripe_lib.Subscription.retrieve(str(sub_id))
                    bps, bpe = stripe_subscription_period_bounds(sub_obj)
                except Exception as exc:
                    logger.warning("checkout.session.completed: period for %s: %s", sub_id, exc)
                user_email = ""
                with get_connection() as conn:
                    conn.execute(
                        "UPDATE users SET plan=?, stripe_subscription_id=?, trial_ends_at='', segment='', "
                        "billing_period_start=?, billing_period_end=? WHERE id=?",
                        (new_plan, sub_id, bps, bpe, user_id),
                    )
                    conn.commit()
                    row = conn.execute("SELECT email FROM users WHERE id=?", (user_id,)).fetchone()
                    user_email = row["email"] if row else ""
                logger.info("Subscription checkout: user=%s plan=%s sub=%s price_id=%s", user_id, new_plan, sub_id, price_id)
                if user_email:
                    import asyncio as _asyncio
                    _asyncio.create_task(
                        _asyncio.to_thread(_notify_admin_new_subscriber, user_email, new_plan, billing_interval)
                    )

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
            if status in ("active", "trialing", "past_due"):
                # Resolve tier from the subscription's current price ID
                from config import PRICE_ID_TO_PLAN
                try:
                    items = sub.get("items", {}).get("data", [])
                    price_id = items[0]["price"]["id"] if items else ""
                except Exception:
                    price_id = ""
                new_plan = PRICE_ID_TO_PLAN.get(price_id, "pro")
            else:
                new_plan = "free"
            bps, bpe = "", ""
            try:
                from core.usage_period import stripe_subscription_period_bounds

                bps, bpe = stripe_subscription_period_bounds(sub)
            except Exception:
                pass
            with get_connection() as conn:
                if status in ("active", "trialing", "past_due") and bps:
                    conn.execute(
                        "UPDATE users SET plan=?, billing_period_start=?, billing_period_end=? "
                        "WHERE stripe_subscription_id=?",
                        (new_plan, bps, bpe, sub_id),
                    )
                else:
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
        # After the first retry grace period, mark the account as past_due so
        # require_active_plan blocks access. Stripe will fire
        # customer.subscription.deleted once it exhausts all retries — that
        # sets plan='free' as the final state.
        if attempt >= 2 and customer_id:
            with get_connection() as conn:
                conn.execute(
                    "UPDATE users SET plan='past_due' WHERE stripe_customer_id=? AND plan NOT IN ('free', 'past_due')",
                    (customer_id,),
                )
                conn.commit()
            logger.info("Marked user past_due for customer=%s after %d failed attempt(s)", customer_id, attempt)

    elif event["type"] == "invoice.payment_succeeded":
        # Renewal confirmed — restore access if the user was past_due.
        invoice = event["data"]["object"]
        customer_id = invoice.get("customer", "")
        sub_id = invoice.get("subscription", "")
        billing_reason = invoice.get("billing_reason", "")
        # Only act on renewals, not the initial checkout invoice (already
        # handled by checkout.session.completed).
        if customer_id and sub_id and billing_reason == "subscription_cycle":
            from config import PRICE_ID_TO_PLAN
            try:
                lines = invoice.get("lines", {}).get("data", [])
                price_id = lines[0]["price"]["id"] if lines else ""
            except Exception:
                price_id = ""
            new_plan = PRICE_ID_TO_PLAN.get(price_id, "pro")
            bps, bpe = "", ""
            try:
                from core.usage_period import stripe_subscription_period_bounds

                sub_obj = stripe_lib.Subscription.retrieve(str(sub_id))
                bps, bpe = stripe_subscription_period_bounds(sub_obj)
            except Exception as exc:
                logger.warning("invoice.payment_succeeded: period for %s: %s", sub_id, exc)
            with get_connection() as conn:
                if bps:
                    conn.execute(
                        "UPDATE users SET plan=?, billing_period_start=?, billing_period_end=? "
                        "WHERE stripe_customer_id=? AND stripe_subscription_id=?",
                        (new_plan, bps, bpe, customer_id, sub_id),
                    )
                else:
                    conn.execute(
                        "UPDATE users SET plan=? WHERE stripe_customer_id=? AND stripe_subscription_id=?",
                        (new_plan, customer_id, sub_id),
                    )
                conn.commit()
            logger.info("Renewal confirmed: customer=%s sub=%s plan=%s", customer_id, sub_id, new_plan)

    return {"received": True}


# ── User preferences (voice overlay, golden mode, onboarding) ─────────────────

class PrefsReq(BaseModel):
    voice_overlay_enabled: int | None = None
    golden_mode_enabled: int | None = None
    live_orryon_enabled: int | None = None
    briefing_time: str | None = None
    briefing_includes: str | None = None
    onboarding_complete: int | None = None


@router.get("/api/preferences")
async def get_prefs(user: dict = Depends(get_current_user)):
    prefs = get_user_preferences(user["user_id"])
    return {
        "voice_overlay_enabled": bool(prefs.get("voice_overlay_enabled", 0)),
        "golden_mode_enabled": bool(prefs.get("golden_mode_enabled", 0)),
        "live_orryon_enabled": bool(prefs.get("live_orryon_enabled", 1)),  # default ON
        "briefing_time": prefs.get("briefing_time", "07:00"),
        "briefing_includes": prefs.get("briefing_includes", "finance,health,calendar,goals"),
        "onboarding_complete": bool(prefs.get("onboarding_complete", 0)),
    }


@router.patch("/api/preferences")
async def update_prefs(body: PrefsReq, user: dict = Depends(get_current_user)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if updates:
        upsert_user_preferences(user["user_id"], updates)
    return {"updated": True}


# ── Chat usage summary ────────────────────────────────────────────────────────

@router.get("/api/chat/usage")
async def chat_usage(user: dict = Depends(get_current_user)):
    from backend.deps import (
        USAGE_NEAR_LIMIT_RATIO,
        get_chat_limit,
        get_suggested_upgrade_plan,
    )
    from core.usage_period import resolve_usage_period
    from db import get_monthly_token_usage

    uid = user["user_id"]
    with get_connection() as conn:
        user_row = conn.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    if not user_row:
        raise HTTPException(404, "User not found")
    user_row = dict(user_row)
    period = resolve_usage_period(user_row)
    plan_info = resolve_plan(user_row)
    plan = plan_info["plan"]
    count = get_chat_message_count(uid, period.key)
    limit = get_chat_limit(plan)
    token_usage = get_monthly_token_usage(uid, period.key)
    spend_cap = get_monthly_spend_cap(plan)
    token_cap = get_monthly_token_cap(plan)
    spend_usd = round(token_usage["cost_usd"], 4)
    at_message_limit = limit != -1 and count >= limit
    at_spend_limit = spend_cap > 0 and spend_usd >= spend_cap
    near_spend_limit = (
        spend_cap > 0 and spend_usd >= spend_cap * USAGE_NEAR_LIMIT_RATIO
    )
    return {
        "messages_used": count,
        "limit": limit,
        "unlimited": limit == -1,
        "plan": plan,
        "spend_usd": spend_usd,
        "spend_cap_usd": spend_cap,
        "tokens_used": token_usage["total_tokens"],
        "token_cap": token_cap,
        "upgrade_plan": get_suggested_upgrade_plan(plan),
        "at_limit": at_message_limit or at_spend_limit,
        "near_limit": near_spend_limit and not at_spend_limit,
        "reset_date": period.reset_at.isoformat(),
        "usage_resets_label": period.reset_label,
    }
