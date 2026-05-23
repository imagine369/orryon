"""
backend/routers/account.py — Account settings, data portability, and preferences.

Stripe billing lives in backend/routers/billing.py and stripe_webhook.py (Phase 2b).
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
    EmailChangeSendReq,
    EmailChangeVerifyReq,
    SettingsUpdate,
)
from config import APP_URL, GROK_MODEL, SMTP_ENABLED, XAI_API_KEY
from core.display_name import normalize_display_name
from db.preferences import normalize_life_priorities, parse_life_priorities
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
# ── User preferences (voice overlay, golden mode, onboarding) ─────────────────

class PrefsReq(BaseModel):
    voice_overlay_enabled: int | None = None
    golden_mode_enabled: int | None = None
    live_orryon_enabled: int | None = None
    briefing_time: str | None = None
    briefing_includes: str | None = None
    onboarding_complete: int | None = None
    life_priorities: str | None = None
    life_priorities_set: int | None = None


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
        "life_priorities": parse_life_priorities(prefs.get("life_priorities", "")),
        "life_priorities_set": bool(prefs.get("life_priorities_set", 0)),
    }


@router.patch("/api/preferences")
async def update_prefs(body: PrefsReq, user: dict = Depends(get_current_user)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if "life_priorities" in updates:
        updates["life_priorities"] = normalize_life_priorities(updates["life_priorities"])
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
        "is_trial_period": period.is_trial_period,
    }
