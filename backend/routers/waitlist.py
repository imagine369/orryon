"""
backend/routers/waitlist.py — Early-access waitlist endpoints.

Public endpoints (no auth required):
    POST /api/waitlist              — Add an email to the waitlist.
    GET  /api/waitlist/check        — Check if an email is approved.

Admin endpoints (secret-key protected):
    GET    /api/admin/waitlist            — Download the full waitlist as CSV.
    GET    /api/admin/waitlist/approve    — Approve an email (one-click from notification).
    DELETE /api/admin/waitlist            — Remove a single email from the waitlist.
"""

from __future__ import annotations

import asyncio
import csv
import hmac
import html as _html
import io
import logging
import os
import re
import secrets
import uuid
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from urllib.parse import quote as urlquote

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import db
from backend.cache import check_rate_limit_async
from config import RESEND_ENABLED, SMTP_ENABLED, SMTP_FROM, SMTP_USER, CONTACT_EMAIL
from email_sender import _send_email, orryon_email_header_html, smtp_diagnostics

APP_URL = os.getenv("APP_URL", "https://www.orryon.com")
API_URL = os.getenv("API_URL", os.getenv("NEXT_PUBLIC_API_URL", "https://api.orryon.com"))

# Base URL embedded in the admin "Approve User" email button. We deliberately
# default to the customer-facing frontend domain (APP_URL) rather than the
# backend's API host:
#
#   * Reliability — the marketing site is how users reach orryon in the first
#     place, so it's always DNS-live. The backend's custom domain
#     (api.orryon.com) is optional and has historically been the source of 404s
#     when the CNAME drifts out of sync with Railway.
#   * Forwarding — the Next.js `/api/[[...path]]` catch-all route proxies every
#     `/api/*` request (including admin GETs with query strings) straight to
#     this backend. Approve links that go through the frontend domain always
#     reach the right backend, regardless of which Railway URL it's on.
#   * Overridable — set APPROVE_URL_BASE in the backend env to pin a specific
#     host if you ever want the raw API URL (e.g. for internal-only admin
#     tooling that shouldn't transit the public frontend).
_APPROVE_URL_BASE = os.getenv("APPROVE_URL_BASE", APP_URL).rstrip("/")

logger = logging.getLogger(__name__)
router = APIRouter(tags=["waitlist"])

_EMAIL_MAX_LEN = 254
_HEADER_INJECTION_RE = re.compile(r"[\r\n\x00]")


def _verify_admin_secret(provided: str) -> None:
    """Constant-time comparison for ADMIN_SECRET to avoid timing attacks."""
    expected = os.getenv("ADMIN_SECRET", "")
    if not expected:
        raise HTTPException(status_code=403, detail="Forbidden.")
    if not hmac.compare_digest(provided or "", expected):
        raise HTTPException(status_code=403, detail="Forbidden.")


def _assert_header_safe(value: str, field: str) -> None:
    if _HEADER_INJECTION_RE.search(value):
        raise HTTPException(status_code=422, detail=f"{field} contains invalid characters.")


class WaitlistRequest(BaseModel):
    email: str


@router.post("/api/waitlist", status_code=201)
async def join_waitlist(body: WaitlistRequest, request: Request):
    email = body.email.strip().lower()
    if not email or "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=422, detail="Invalid email address.")
    if len(email) > _EMAIL_MAX_LEN:
        raise HTTPException(status_code=422, detail="Email address is too long.")
    _assert_header_safe(email, "Email")

    client_ip = (request.client.host if request.client else "unknown") or "unknown"
    if not await check_rate_limit_async(f"waitlist:ip:{client_ip}", limit=5, window_seconds=3600):
        raise HTTPException(status_code=429, detail="Too many waitlist signups — please try again later.")
    if not await check_rate_limit_async("waitlist:global", limit=200, window_seconds=3600):
        logger.warning("Global waitlist rate limit hit (ip=%s).", client_ip)
        raise HTTPException(status_code=429, detail="Waitlist signups are temporarily paused — try again shortly.")

    # 256-bit URL-safe token embedded in the admin's "Approve User" email link.
    # Random, per-signup, single-use — cleared from the row the moment an admin
    # clicks approve. Replaces the old pattern of putting ADMIN_SECRET into
    # query strings, which leaked the master credential into browser history,
    # server access logs, and screenshots. Leaking one of these tokens can at
    # worst approve one pending signup, once.
    approve_token = secrets.token_urlsafe(32)

    conn = db.get_connection()
    try:
        cur = conn.cursor()
        existing = cur.execute(
            "SELECT id FROM waitlist WHERE email = ?", (email,)
        ).fetchone()
        if existing:
            return {"status": "already_on_waitlist"}

        now = datetime.now(timezone.utc).isoformat()
        cur.execute(
            "INSERT INTO waitlist (id, email, created_at, approve_token) "
            "VALUES (?, ?, ?, ?)",
            (str(uuid.uuid4()), email, now, approve_token),
        )
        conn.commit()

        row = cur.execute("SELECT COUNT(*) as cnt FROM waitlist").fetchone()
        total = row["cnt"] if isinstance(row, dict) else row[0]
    finally:
        conn.close()

    # Run the SMTP send off the event loop so signup latency stays low and a slow
    # SMTP server (up to the 15s timeout) never blocks the response.
    try:
        await asyncio.to_thread(_notify_admin, email, now, total, approve_token)
    except Exception as exc:  # noqa: BLE001 — we never want notification to break signup
        logger.warning("Admin notification dispatch failed for %s: %s", email, exc)
    return {"status": "added"}


def _notify_admin(email: str, joined_at: str, total: int, approve_token: str) -> None:
    """Fire-and-forget email to admin when someone joins the waitlist.

    `approve_token` is a per-signup, single-use random value. The admin's
    "Approve User" button embeds this token (instead of ADMIN_SECRET) so the
    URL stays useless to anyone who sees it after the admin clicks it once.
    """
    admin = (CONTACT_EMAIL or "").strip()
    if not SMTP_ENABLED and not RESEND_ENABLED:
        logger.warning(
            "Waitlist signup for %s — admin notification skipped because neither "
            "RESEND_API_KEY nor SMTP_* variables are configured.",
            email,
        )
        return
    if not admin:
        logger.warning(
            "Waitlist signup for %s — admin notification skipped because CONTACT_EMAIL "
            "(and SMTP_USER fallback) is empty.",
            email,
        )
        return
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"New waitlist signup — #{total}"
        # From MUST be the authenticated SMTP identity — Gmail rejects / spam-filters
        # messages whose From header doesn't match the logged-in user. Replies still
        # land in the admin inbox via Reply-To.
        msg["From"] = (SMTP_FROM or SMTP_USER or admin)
        msg["To"] = admin
        msg["Reply-To"] = admin

        # Token-only URL — no shared secret in query string. If this email is
        # ever forwarded, screenshotted, or pulled from a log, the worst an
        # attacker can do is approve this one pending signup before the admin.
        # URL targets the frontend domain; the Next.js catch-all `/api/*`
        # proxy forwards it to this backend transparently (see
        # `_APPROVE_URL_BASE` notes above).
        approve_url = (
            f"{_APPROVE_URL_BASE}/api/admin/waitlist/approve"
            f"?token={urlquote(approve_token, safe='')}"
        )
        safe_email = _html.escape(email, quote=True)
        safe_joined = _html.escape(joined_at, quote=True)
        safe_approve = _html.escape(approve_url, quote=True)

        plain = (
            f"New waitlist signup!\n\n"
            f"Email: {email}\n"
            f"Joined: {joined_at}\n"
            f"Total on waitlist: {total}\n\n"
            f"Approve: {approve_url}\n\n"
            f"— orryon"
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
              <p style="margin:0;font-size:14px;color:#92fe9d;
                        text-transform:uppercase;letter-spacing:1px;font-weight:600;">
                New Waitlist Signup
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:16px 0 12px;">
              <span style="font-size:22px;font-weight:700;color:#fff;">{safe_email}</span>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:20px;">
              <div style="background:#0f2027;border:1px solid rgba(0,201,255,0.3);
                          border-radius:12px;padding:14px 20px;display:inline-block;">
                <span style="font-size:32px;font-weight:800;color:#00c9ff;">#{total}</span>
                <span style="font-size:13px;color:#64748b;display:block;margin-top:4px;">
                  total on waitlist
                </span>
              </div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:16px 0 20px;">
              <a href="{safe_approve}"
                 style="display:inline-block;background:#92fe9d;color:#000;
                        font-size:15px;font-weight:700;padding:14px 36px;
                        border-radius:999px;text-decoration:none;">
                Approve User
              </a>
            </td>
          </tr>
          <tr>
            <td align="center">
              <p style="margin:0;font-size:12px;color:#444;">
                {safe_joined}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

        msg.attach(MIMEText(plain, "plain"))
        msg.attach(MIMEText(html, "html"))
        ok, _ = _send_email(admin, msg)
        if ok:
            logger.info("Waitlist signup admin notification sent to %s for %s", admin, email)
        else:
            logger.error(
                "Waitlist signup admin notification FAILED for %s — see previous SMTP "
                "error log line from email_sender.",
                email,
            )
    except Exception as exc:
        logger.warning("Failed to build waitlist notification for %s: %s", email, exc)


@router.get("/api/waitlist/check")
async def check_waitlist(email: str = ""):
    """Check if an email is approved on the waitlist. Used by auth flow."""
    email = email.strip().lower()
    if not email:
        return {"approved": False, "on_waitlist": False}

    admin = CONTACT_EMAIL
    if admin and email == admin.strip().lower():
        return {"approved": True, "on_waitlist": True}

    conn = db.get_connection()
    try:
        row = conn.execute(
            "SELECT approved FROM waitlist WHERE email = ?", (email,)
        ).fetchone()
    finally:
        conn.close()

    if not row:
        return {"approved": False, "on_waitlist": False}
    return {"approved": bool(row["approved"]), "on_waitlist": True}


@router.get("/api/admin/waitlist/approve")
async def approve_waitlist(token: str = "", email: str = "", secret: str = ""):
    """Approve a waitlist entry.

    Two auth paths are supported:

    1. Token (preferred, used by the "Approve User" button in the admin's
       notification email):

           GET /api/admin/waitlist/approve?token=<per-signup-token>

       The token is random 256-bit data stored on the waitlist row at signup
       time. It's validated with a constant-time compare and **cleared on
       success** — clicking the same link a second time returns 410 Gone.
       A leaked token can, at worst, approve its one associated signup once.

    2. Admin secret (legacy / recovery path, retained so operators can
       approve from the CLI when the notification email didn't arrive):

           GET /api/admin/waitlist/approve?email=foo@bar.com&secret=<ADMIN_SECRET>

       NEVER open this variant in a browser — the secret will end up in
       history, logs, and the address bar. Use curl from your terminal.
    """
    token = (token or "").strip()
    if token:
        return await _approve_by_token(token)

    # Fall through to the legacy secret-based path.
    _verify_admin_secret(secret)

    email = email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email or token required.")
    _assert_header_safe(email, "Email")

    conn = db.get_connection()
    try:
        row = conn.execute(
            "SELECT id, approved FROM waitlist WHERE email = ?", (email,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Email not on waitlist.")

        if row["approved"]:
            return {"status": "already_approved", "email": email}

        conn.execute(
            "UPDATE waitlist SET approved = 1, approve_token = '' WHERE email = ?",
            (email,),
        )
        conn.commit()
    finally:
        conn.close()

    _send_welcome_email(email)
    logger.info("Admin approved waitlist entry via secret: %s", email)
    return {"status": "approved", "email": email, "message": f"{email} has been approved and notified."}


async def _approve_by_token(token: str) -> dict:
    """Look up a waitlist row by its single-use approve_token and mark approved.

    The token must be non-empty; we use constant-time compare on the DB value
    to avoid timing side-channels even though 256 random bits are already
    brute-force-infeasible. The token is cleared on successful approve, so
    clicking the same link twice yields a clean 410 Gone instead of silently
    re-approving or leaking "this token existed once".
    """
    # Brute-force protection is really just defence in depth — a 256-bit
    # random value is already unreachable — but a sanity check keeps obvious
    # garbage out of the DB lookup.
    if len(token) < 16 or len(token) > 256:
        raise HTTPException(status_code=400, detail="Invalid approval link.")

    conn = db.get_connection()
    try:
        row = conn.execute(
            "SELECT id, email, approved, approve_token FROM waitlist "
            "WHERE approve_token = ? AND approve_token != ''",
            (token,),
        ).fetchone()

        if not row or not hmac.compare_digest(row["approve_token"] or "", token):
            raise HTTPException(
                status_code=410,
                detail="This approval link has already been used or is invalid.",
            )

        if row["approved"]:
            # Shouldn't happen (approve clears the token) but be graceful.
            conn.execute(
                "UPDATE waitlist SET approve_token = '' WHERE id = ?", (row["id"],)
            )
            conn.commit()
            return {"status": "already_approved", "email": row["email"]}

        conn.execute(
            "UPDATE waitlist SET approved = 1, approve_token = '' WHERE id = ?",
            (row["id"],),
        )
        conn.commit()
        email = row["email"]
    finally:
        conn.close()

    _send_welcome_email(email)
    logger.info("Admin approved waitlist entry via token: %s", email)
    return {
        "status": "approved",
        "email": email,
        "message": f"{email} has been approved and notified.",
    }


@router.delete("/api/admin/waitlist")
async def delete_waitlist_entry(email: str = "", secret: str = ""):
    """Remove a single email from the waitlist. Admin-only.

    Usage:
        curl -X DELETE \\
          "https://api.orryon.com/api/admin/waitlist?email=foo@bar.com&secret=<ADMIN_SECRET>"
    """
    _verify_admin_secret(secret)

    email = email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email required.")
    if len(email) > _EMAIL_MAX_LEN:
        raise HTTPException(status_code=422, detail="Email address is too long.")
    _assert_header_safe(email, "Email")

    conn = db.get_connection()
    try:
        row = conn.execute(
            "SELECT id FROM waitlist WHERE email = ?", (email,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Email not on waitlist.")
        conn.execute("DELETE FROM waitlist WHERE email = ?", (email,))
        conn.commit()
    finally:
        conn.close()

    logger.info("Admin deleted waitlist entry: %s", email)
    return {"status": "deleted", "email": email}


@router.get("/api/admin/email-test")
async def email_test(secret: str = "", to: str = ""):
    """Admin-only SMTP diagnostic. Returns why outbound email is (or isn't) working.

    Hit:  https://<api-host>/api/admin/email-test?secret=<ADMIN_SECRET>
    Or:   https://<api-host>/api/admin/email-test?secret=<ADMIN_SECRET>&to=you@example.com
    """
    _verify_admin_secret(secret)

    target = (to or "").strip()
    if target:
        if "@" not in target or len(target) > _EMAIL_MAX_LEN:
            raise HTTPException(status_code=422, detail="Invalid test recipient.")
        _assert_header_safe(target, "Email")

    report = await asyncio.to_thread(smtp_diagnostics, target or None)
    return report


def _send_welcome_email(email: str) -> None:
    """Send a welcome email telling the user they've been approved."""
    if not SMTP_ENABLED:
        return
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "You're in — welcome to orryon"
        msg["From"] = SMTP_FROM or SMTP_USER
        msg["To"] = email

        login_url = f"{APP_URL}/login"
        safe_login = _html.escape(login_url, quote=True)

        plain = (
            f"You've been approved for early access to orryon!\n\n"
            f"Sign in here: {login_url}\n\n"
            f"Enter your email and verify with the code we send you.\n\n"
            f"— orryon"
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
              <p style="margin:0;font-size:14px;color:#92fe9d;
                        text-transform:uppercase;letter-spacing:1px;font-weight:600;">
                You're In
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:16px 0 20px;">
              <p style="margin:0;font-size:18px;font-weight:700;color:#fff;">
                Welcome to orryon
              </p>
              <p style="margin:8px 0 0;font-size:14px;color:#94a3b8;line-height:1.6;">
                You've been approved for early access.<br>
                Sign in with your email to get started.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <a href="{safe_login}"
                 style="display:inline-block;background:#fff;color:#000;
                        font-size:15px;font-weight:700;padding:14px 36px;
                        border-radius:999px;text-decoration:none;">
                Sign in to orryon
              </a>
            </td>
          </tr>
          <tr>
            <td align="center">
              <p style="margin:0;font-size:12px;color:#444;">
                Questions? Reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

        msg.attach(MIMEText(plain, "plain"))
        msg.attach(MIMEText(html, "html"))
        _send_email(email, msg)  # noqa: F841 — welcome email best-effort
        logger.info("Welcome email sent to %s", email)
    except Exception as exc:
        logger.warning("Failed to send welcome email to %s: %s", email, exc)


@router.get("/api/admin/waitlist")
async def export_waitlist(secret: str = ""):
    _verify_admin_secret(secret)

    conn = db.get_connection()
    try:
        rows = conn.execute(
            "SELECT email, approved, created_at FROM waitlist ORDER BY created_at ASC"
        ).fetchall()
    finally:
        conn.close()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["email", "approved", "joined_at"])
    for row in rows:
        writer.writerow([row["email"], row["approved"], row["created_at"]])
    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=waitlist.csv"},
    )
