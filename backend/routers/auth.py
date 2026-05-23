"""
backend/routers/auth.py — Authentication endpoints.

Handles OTP email sign-in, demo mode, JWT issuance, and signup checkout.
The Next.js frontend calls these to authenticate users before accessing
protected API routes.
"""

from __future__ import annotations

import asyncio
import html as _html
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from functools import partial

from fastapi import APIRouter, Depends, HTTPException, Request

from backend.auth import _parse_device_name, create_token, get_current_user
from backend.cache import cache_set
from backend.deps import ENABLE_DEMO, IS_LOCAL_DEV, IS_PRODUCTION, check_otp_rate_limit
from backend.schemas import AuthRes, SendCodeReq, SignupCheckoutReq, VerifyReq
from config import CONTACT_EMAIL, SMTP_FROM, SMTP_USER
from core.display_name import normalize_display_name
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


def _notify_admin_new_signup(email: str, display_name: str, segment: str) -> None:
    """Send admin notification whenever a brand-new user account is created."""
    from email_sender import _send_email, orryon_email_header_html
    admin = (CONTACT_EMAIL or "").strip()
    if not admin:
        logger.info("New signup for %s — admin notification skipped (CONTACT_EMAIL not set).", email)
        return

    is_breathe = segment == "free_breathe"
    label     = "🌬️ Free Breathe Signup" if is_breathe else "✨ New User Signup"
    plan_note = "Free · Breathe only" if is_breathe else "Free trial — will choose plan at checkout"
    accent    = "#3ecfbe" if is_breathe else "#a78bfa"

    safe_email = _html.escape(email, quote=True)
    safe_name  = _html.escape(display_name or "—", quote=True)

    plain = (
        f"{label}\n\n"
        f"Name:  {display_name or '—'}\n"
        f"Email: {email}\n"
        f"Plan:  {plan_note}\n\n"
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
                        text-transform:uppercase;color:{accent};">{label}</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:14px 0 20px;">
              <span style="font-size:20px;font-weight:700;color:#fff;">{safe_email}</span>
              <span style="display:block;font-size:13px;color:#94a3b8;margin-top:4px;">{safe_name}</span>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:20px;">
              <div style="background:#0f172a;border:1px solid rgba(255,255,255,0.1);
                          border-radius:12px;padding:12px 20px;display:inline-block;">
                <span style="font-size:13px;color:#94a3b8;">{plan_note}</span>
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
    msg["Subject"] = f"{label} — {email}"
    msg["From"]    = SMTP_FROM or SMTP_USER or admin
    msg["To"]      = admin
    msg.attach(MIMEText(plain, "plain"))
    msg.attach(MIMEText(html, "html"))

    ok, _ = _send_email(admin, msg)
    if ok:
        logger.info("Admin notified of new signup: %s (segment=%s)", email, segment or "standard")
    else:
        logger.warning("Failed to notify admin of new signup: %s", email)

_PUBLIC_USER_FIELDS = {
    "id", "email", "display_name", "created_at", "plan", "trial_ends_at",
    "currency", "budget_cycle_start", "spending_alert_pct",
    "default_reminder_minutes", "daily_digest_enabled", "daily_digest_time",
    "weekly_report_enabled", "bill_due_alert_days", "segment",
}


def _safe_user(user: dict) -> dict:
    """Strip sensitive fields before sending user data to the client."""
    out = {k: v for k, v in user.items() if k in _PUBLIC_USER_FIELDS}
    if out.get("display_name"):
        out["display_name"] = normalize_display_name(out["display_name"])
    return out


@router.get("/api/auth/email-status")
async def auth_email_status():
    """Public check: is outbound email configured? (no send, no secrets.)"""
    from config import RESEND_ENABLED, SMTP_ENABLED

    if RESEND_ENABLED:
        provider = "resend"
    elif SMTP_ENABLED:
        provider = "smtp"
    else:
        provider = "none"
    return {"configured": provider != "none", "provider": provider}


@router.post("/api/auth/send-code")
async def auth_send_code(body: SendCodeReq, request: Request):
    """
    Send an OTP verification code to the given email address.
    Open to all — no waitlist required.
    """
    email = body.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(400, "Invalid email address")

    check_otp_rate_limit(request, email)

    code = create_verification_code(email)
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(None, partial(send_verification_code, email, code))
    sent = result["sent"]
    reason = result["reason"]

    if not sent:
        logger.warning("OTP email to %s failed (reason: %s): %s", email, reason, result["detail"])

        # Local dev fallback: show the code on-screen so the developer can still sign in.
        if IS_LOCAL_DEV:
            return {
                "sent": False,
                "dev_code": code,
                "smtp_configured": reason != "not_configured",
                "message": result["detail"],
            }

        # Production: surface a real error instead of silently showing "Check your inbox".
        if reason == "not_configured":
            raise HTTPException(
                503,
                "Email delivery isn't configured on the server yet. "
                "Please contact support@orryon.com so we can send your code.",
            )
        raise HTTPException(
            502,
            result.get("detail")
            or (
                "We couldn't send your verification email right now. "
                "Please try again in a minute, or contact support@orryon.com if it keeps failing."
            ),
        )

    return {
        "sent": True,
        "dev_code": "",
        "smtp_configured": True,
        "message": f"Code sent to {email}",
    }


@router.post("/api/auth/verify", response_model=AuthRes)
async def auth_verify(body: VerifyReq, request: Request):
    """Verify OTP code, create/fetch user, issue JWT."""
    from db import _check_otp_lockout
    email = body.email.strip().lower()
    if _check_otp_lockout(email):
        raise HTTPException(429, "Too many attempts. Please wait 15 minutes then request a new code.")
    if not verify_code(email, body.code.strip()):
        raise HTTPException(401, "Invalid or expired code")
    display_name = normalize_display_name((body.display_name or "").strip())
    segment = "free_breathe" if body.free_breathing_signup else ""
    is_new_user = False
    with get_connection() as conn:
        existing = conn.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone()
        is_new_user = existing is None
    user = get_or_create_user_by_email(email, display_name=display_name, segment=segment)
    if display_name and user.get("display_name") != display_name:
        update_row("users", {"display_name": display_name}, {"id": user["id"]})
        user["display_name"] = display_name
    # Notify admin of every new account (fire-and-forget, never blocks response)
    if is_new_user:
        asyncio.create_task(
            asyncio.to_thread(_notify_admin_new_signup, email, user.get("display_name", ""), segment)
        )
    ua = request.headers.get("user-agent", "")
    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "")
    if ip and "," in ip:
        ip = ip.split(",")[0].strip()
    token = create_token(user["id"], email, device_name=_parse_device_name(ua), ip_address=ip)
    return {"token": token, "user": _safe_user(user)}


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

    from backend.billing.stripe_urls import validate_stripe_return_url

    success_url = validate_stripe_return_url(body.success_url, "success_url")
    cancel_url = validate_stripe_return_url(body.cancel_url, "cancel_url")

    with get_connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE id=?", (user["user_id"],)).fetchone()
    if not row:
        raise HTTPException(404, "User not found")
    row = dict(row)

    if row.get("stripe_subscription_id"):
        raise HTTPException(400, "You already have an active subscription")

    loop = asyncio.get_running_loop()

    customer_id = row.get("stripe_customer_id") or ""
    if not customer_id:
        customer = await loop.run_in_executor(
            None,
            partial(
                stripe_lib.Customer.create,
                email=row["email"],
                name=row.get("display_name") or "",
                metadata={"user_id": row["id"]},
            ),
        )
        customer_id = customer.id
        with get_connection() as conn:
            conn.execute(
                "UPDATE users SET stripe_customer_id=? WHERE id=?",
                (customer_id, row["id"]),
            )
            conn.commit()

    trial_days = get_trial_days(body.price_id)
    checkout_params: dict = {
        "customer": customer_id,
        "payment_method_types": ["card"],
        "line_items": [{"price": body.price_id, "quantity": 1}],
        "mode": "subscription",
        "success_url": success_url,
        "cancel_url": cancel_url,
        "metadata": {"user_id": row["id"], "price_id": body.price_id},
    }
    if trial_days:
        checkout_params["subscription_data"] = {"trial_period_days": trial_days}
    session = await loop.run_in_executor(
        None, partial(stripe_lib.checkout.Session.create, **checkout_params)
    )
    return {"checkout_url": session.url}


@router.post("/api/auth/demo", response_model=AuthRes)
async def auth_demo(request: Request):
    """Issue a demo JWT for local development.

    Disabled unless ENABLE_DEMO=1 AND we're running in a local-dev environment.
    """
    if not ENABLE_DEMO:
        raise HTTPException(403, "Demo mode is disabled")
    email = "demo@orryon.app"
    user = get_or_create_user_by_email(email)
    existing_txns = fetch_rows("transactions", {"user_id": user["id"]})
    if not existing_txns:
        from core.tools import seed_sample_data
        seed_sample_data(user["id"])
    ua = request.headers.get("user-agent", "")
    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "")
    if ip and "," in ip:
        ip = ip.split(",")[0].strip()
    token = create_token(user["id"], email, device_name=_parse_device_name(ua), ip_address=ip)
    return {"token": token, "user": _safe_user(user)}


@router.get("/api/auth/me")
async def auth_me(user: dict = Depends(get_current_user)):
    """Return the authenticated user's profile (sensitive fields stripped)."""
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE id=?", (user["user_id"],)).fetchone()
    if not row:
        raise HTTPException(404, "User not found")
    return _safe_user(dict(row))


@router.post("/api/auth/sign-key")
async def auth_sign_key(
    request: Request,
    user: dict = Depends(get_current_user),
):
    """
    Issue the HMAC signing key for the current session. Used by the frontend
    to sign calls to /api/chat and /api/voice/*.

    The key is *derived* from JWT_SECRET + user_id + iat, so there's no server
    state to invalidate — rotating the user's JWT automatically invalidates
    any in-flight signing keys. Clients keep this in memory only; it must
    never be persisted to localStorage/sessionStorage.
    """
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise HTTPException(401, "Missing bearer token.")
    token = auth.split(" ", 1)[1].strip()
    from backend.signing import issue_signing_key_for_token
    try:
        return issue_signing_key_for_token(token)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("sign-key derivation failed for uid=%s: %s", user.get("user_id"), exc)
        raise HTTPException(500, "Could not issue signing key.")


# ── Session management (stolen-device protection) ────────────────────────────


@router.get("/api/sessions")
async def list_sessions(user: dict = Depends(get_current_user)):
    """List active (non-revoked) sessions for the current user."""
    uid = user["user_id"]
    current_jti = user.get("jti", "")
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM auth_sessions WHERE user_id=? AND revoked=0 ORDER BY last_active DESC",
            (uid,),
        ).fetchall()
    sessions = []
    for r in rows:
        s = dict(r)
        s["current"] = s["id"] == current_jti
        sessions.append(s)
    return sessions


@router.delete("/api/sessions/{session_id}")
async def revoke_session(session_id: str, user: dict = Depends(get_current_user)):
    """Revoke a specific session (sign out that device)."""
    uid = user["user_id"]
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id FROM auth_sessions WHERE id=? AND user_id=?",
            (session_id, uid),
        ).fetchone()
    if not row:
        raise HTTPException(404, "Session not found")
    update_row("auth_sessions", {"revoked": 1}, {"id": session_id, "user_id": uid})
    await cache_set(f"session_valid:{session_id}", False, 60)
    return {"ok": True}


@router.post("/api/sessions/revoke-all")
async def revoke_all_sessions(user: dict = Depends(get_current_user)):
    """Revoke all sessions except the current one (stolen-device kill switch)."""
    uid = user["user_id"]
    current_jti = user.get("jti", "")
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id FROM auth_sessions WHERE user_id=? AND revoked=0",
            (uid,),
        ).fetchall()
        for r in rows:
            sid = dict(r)["id"]
            if sid != current_jti:
                conn.execute(
                    "UPDATE auth_sessions SET revoked=1 WHERE id=?", (sid,),
                )
                await cache_set(f"session_valid:{sid}", False, 60)
        conn.commit()
    return {"ok": True, "revoked_count": sum(1 for r in rows if dict(r)["id"] != current_jti)}


@router.post("/api/auth/logout")
async def auth_logout(user: dict = Depends(get_current_user)):
    """Mark the current session as revoked server-side."""
    jti = user.get("jti", "")
    if jti:
        update_row("auth_sessions", {"revoked": 1}, {"id": jti})
        await cache_set(f"session_valid:{jti}", False, 60)
    return {"ok": True}
