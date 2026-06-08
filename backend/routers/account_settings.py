"""
backend/routers/account_settings.py — Profile settings, email change, preferences, chat usage.

Extracted from account.py (Phase 2c).
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from backend.auth import _parse_device_name, create_token, get_current_user
from backend.deps import (
    IS_LOCAL_DEV,
    get_monthly_spend_cap,
    get_monthly_token_cap,
    resolve_plan,
)
from backend.schemas import (
    EmailChangeSendReq,
    EmailChangeVerifyReq,
    SettingsUpdate,
)
from config import GROK_MODEL, SMTP_ENABLED, XAI_API_KEY
from core.display_name import normalize_display_name
from db.preferences import normalize_life_priorities, parse_life_priorities
from db import (
    create_verification_code,
    get_chat_message_count,
    get_connection,
    get_user_preferences,
    upsert_user_preferences,
    update_row,
    verify_code,
)
from email_sender import send_verification_code

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

# ── User preferences (voice overlay, golden mode, onboarding) ─────────────────

class PrefsReq(BaseModel):
    voice_overlay_enabled: int | None = None
    golden_mode_enabled: int | None = None
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
