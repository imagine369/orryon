"""
backend/routers/waitlist.py — Early-access waitlist endpoints.

Public endpoints (no auth required):
    POST /api/waitlist              — Add an email to the waitlist.
    GET  /api/waitlist/check        — Check if an email is approved.

Admin endpoints (secret-key protected):
    GET  /api/admin/waitlist            — Download the full waitlist as CSV.
    GET  /api/admin/waitlist/approve    — Approve an email (one-click from notification).
"""

from __future__ import annotations

import csv
import io
import logging
import os
import uuid
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import db
from config import SMTP_ENABLED, SMTP_FROM, SMTP_USER, CONTACT_EMAIL
from email_sender import _send_email

APP_URL = os.getenv("APP_URL", "https://www.orryon.com")
API_URL = os.getenv("API_URL", os.getenv("NEXT_PUBLIC_API_URL", "https://api.orryon.com"))

logger = logging.getLogger(__name__)
router = APIRouter(tags=["waitlist"])


class WaitlistRequest(BaseModel):
    email: str


@router.post("/api/waitlist", status_code=201)
async def join_waitlist(body: WaitlistRequest):
    email = body.email.strip().lower()
    if not email or "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=422, detail="Invalid email address.")

    conn = db.get_connection()
    cur = conn.cursor()

    existing = cur.execute(
        "SELECT id FROM waitlist WHERE email = ?", (email,)
    ).fetchone()
    if existing:
        return {"status": "already_on_waitlist"}

    now = datetime.now(timezone.utc).isoformat()
    cur.execute(
        "INSERT INTO waitlist (id, email, created_at) VALUES (?, ?, ?)",
        (str(uuid.uuid4()), email, now),
    )
    conn.commit()

    row = cur.execute("SELECT COUNT(*) as cnt FROM waitlist").fetchone()
    total = row["cnt"] if isinstance(row, dict) else row[0]
    _notify_admin(email, now, total)

    return {"status": "added"}


def _notify_admin(email: str, joined_at: str, total: int) -> None:
    """Fire-and-forget email to admin when someone joins the waitlist."""
    admin = CONTACT_EMAIL
    if not SMTP_ENABLED or not admin:
        return
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"New waitlist signup — #{total}"
        msg["From"] = admin
        msg["To"] = admin

        admin_secret = os.getenv("ADMIN_SECRET", "")
        approve_url = f"{API_URL}/api/admin/waitlist/approve?email={email}&secret={admin_secret}"

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
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <span style="font-size:28px;font-weight:700;letter-spacing:-0.5px;">&#128176; orryon</span>
            </td>
          </tr>
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
              <span style="font-size:22px;font-weight:700;color:#fff;">{email}</span>
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
              <a href="{approve_url}"
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
                {joined_at}
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
        _send_email(admin, msg)
    except Exception as exc:
        logger.warning("Failed to send waitlist notification: %s", exc)


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
    row = conn.execute(
        "SELECT approved FROM waitlist WHERE email = ?", (email,)
    ).fetchone()
    conn.close()

    if not row:
        return {"approved": False, "on_waitlist": False}
    return {"approved": bool(row["approved"]), "on_waitlist": True}


@router.get("/api/admin/waitlist/approve")
async def approve_waitlist(email: str = "", secret: str = ""):
    """One-click approve from the admin notification email."""
    admin_secret = os.getenv("ADMIN_SECRET", "")
    if not admin_secret or secret != admin_secret:
        raise HTTPException(status_code=403, detail="Forbidden.")

    email = email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email required.")

    conn = db.get_connection()
    row = conn.execute("SELECT id, approved FROM waitlist WHERE email = ?", (email,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Email not on waitlist.")

    if row["approved"]:
        conn.close()
        return {"status": "already_approved", "email": email}

    conn.execute("UPDATE waitlist SET approved = 1 WHERE email = ?", (email,))
    conn.commit()
    conn.close()

    _send_welcome_email(email)

    return {"status": "approved", "email": email, "message": f"{email} has been approved and notified."}


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
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <span style="font-size:28px;font-weight:700;letter-spacing:-0.5px;">&#128176; orryon</span>
            </td>
          </tr>
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
              <a href="{login_url}"
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


@router.get("/api/admin/waitlist")
async def export_waitlist(secret: str = ""):
    admin_secret = os.getenv("ADMIN_SECRET", "")
    if not admin_secret or secret != admin_secret:
        raise HTTPException(status_code=403, detail="Forbidden.")

    conn = db.get_connection()
    rows = conn.execute(
        "SELECT email, approved, created_at FROM waitlist ORDER BY created_at ASC"
    ).fetchall()

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
