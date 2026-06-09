"""Admin waitlist tooling and outbound email diagnostics (secret-key protected)."""

from __future__ import annotations

import asyncio
import csv
import hmac
import html as _html
import io
import logging
import os
import re
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

import db
from config import SMTP_ENABLED, SMTP_FROM, SMTP_USER
from email_sender import _send_email, orryon_email_header_html, smtp_diagnostics

APP_URL = os.getenv("APP_URL", "https://www.orryon.com")

logger = logging.getLogger(__name__)
router = APIRouter(tags=["waitlist-admin"])

_EMAIL_MAX_LEN = 254
_HEADER_INJECTION_RE = re.compile(r"[\r\n\x00]")


def _verify_admin_secret(provided: str) -> None:
    expected = os.getenv("ADMIN_SECRET", "")
    if not expected:
        raise HTTPException(status_code=403, detail="Forbidden.")
    if not hmac.compare_digest(provided or "", expected):
        raise HTTPException(status_code=403, detail="Forbidden.")


def _assert_header_safe(value: str, field: str) -> None:
    if _HEADER_INJECTION_RE.search(value):
        raise HTTPException(status_code=422, detail=f"{field} contains invalid characters.")


@router.get("/api/admin/waitlist/approve")
async def approve_waitlist(token: str = "", email: str = "", secret: str = ""):
    """Approve a waitlist entry via single-use token or legacy admin secret."""
    token = (token or "").strip()
    if token:
        return await _approve_by_token(token)

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
    """Admin-only SMTP diagnostic."""
    _verify_admin_secret(secret)

    target = (to or "").strip()
    if target:
        if "@" not in target or len(target) > _EMAIL_MAX_LEN:
            raise HTTPException(status_code=422, detail="Invalid test recipient.")
        _assert_header_safe(target, "Email")

    report = await asyncio.to_thread(smtp_diagnostics, target or None)
    return report


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


def _send_welcome_email(email: str) -> None:
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
        _send_email(email, msg)
        logger.info("Welcome email sent to %s", email)
    except Exception as exc:
        logger.warning("Failed to send welcome email to %s: %s", email, exc)
