"""
backend/routers/contact.py — Contact form email endpoint.

Public endpoint (no auth required):
    POST /api/contact    — Forward a contact-form message to the site owner via SMTP.

The recipient is read from CONTACT_EMAIL in .env (falls back to SMTP_USER).
SMTP must be configured (SMTP_HOST / SMTP_USER / SMTP_PASS) for delivery to work.
"""

from __future__ import annotations

import logging
import os
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from email_sender import _send_email
from config import SMTP_ENABLED, SMTP_FROM, SMTP_USER

router = APIRouter(tags=["contact"])
logger = logging.getLogger(__name__)

# Recipient address — who receives the contact form messages
CONTACT_EMAIL: str = os.getenv("CONTACT_EMAIL", "") or SMTP_USER


# ── Email template ────────────────────────────────────────────────────────────

def _build_contact_email(
    name: str,
    sender_email: str,
    subject: str,
    message: str,
) -> MIMEMultipart:
    from_addr = SMTP_FROM or SMTP_USER
    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"[orryon contact] {subject}"
    msg["From"] = from_addr
    msg["To"] = CONTACT_EMAIL
    msg["Reply-To"] = sender_email

    safe_message = message.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    plain = (
        f"New contact form submission from orryon.com\n\n"
        f"Name:    {name}\n"
        f"Email:   {sender_email}\n"
        f"Subject: {subject}\n\n"
        f"Message:\n{message}\n\n"
        f"— Reply directly to this email to respond to {name}."
    )

    html = f"""<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
             background:#000;color:#fff;margin:0;padding:0;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="480" cellpadding="0" cellspacing="0"
               style="background:#111;border-radius:16px;padding:40px;">
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <span style="font-size:24px;font-weight:700;letter-spacing:-0.5px;">&#128176; orryon</span>
              <p style="margin:6px 0 0;font-size:12px;color:#555;letter-spacing:0.5px;">
                New message from orryon.com
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:20px;">
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="border:1px solid #1e293b;border-radius:10px;overflow:hidden;">
                <tr style="background:#0f172a;">
                  <td style="padding:12px 16px;border-bottom:1px solid #1e293b;">
                    <span style="font-size:10px;color:#475569;text-transform:uppercase;
                                 letter-spacing:1px;display:block;margin-bottom:4px;">From</span>
                    <span style="font-size:14px;color:#f1f5f9;font-weight:600;">{name}</span>
                    <span style="font-size:13px;color:#64748b;"> &lt;{sender_email}&gt;</span>
                  </td>
                </tr>
                <tr style="background:#0f172a;">
                  <td style="padding:12px 16px;">
                    <span style="font-size:10px;color:#475569;text-transform:uppercase;
                                 letter-spacing:1px;display:block;margin-bottom:4px;">Subject</span>
                    <span style="font-size:14px;color:#f1f5f9;">{subject}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px;background:#0f172a;border:1px solid #1e293b;
                        border-radius:12px;">
              <p style="margin:0;font-size:14px;color:#e2e8f0;line-height:1.75;
                         white-space:pre-wrap;">{safe_message}</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:24px;">
              <a href="mailto:{sender_email}?subject=Re: {subject}"
                 style="display:inline-block;padding:11px 28px;background:#fff;color:#000;
                         font-weight:600;font-size:13px;border-radius:8px;
                         text-decoration:none;letter-spacing:0.2px;">
                Reply to {name}
              </a>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:20px;">
              <p style="margin:0;font-size:11px;color:#333;">
                Submitted via the contact form at orryon.com
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
    return msg


# ── Request model ─────────────────────────────────────────────────────────────

class ContactRequest(BaseModel):
    name: str
    email: str
    subject: str
    message: str


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.post("/api/contact")
async def submit_contact(body: ContactRequest):
    """
    Receive a contact form submission and email it to CONTACT_EMAIL via SMTP.
    No authentication required — this is a public endpoint.
    """
    name = body.name.strip()
    email = body.email.strip().lower()
    subject = body.subject.strip()
    message = body.message.strip()

    # Input validation
    if not name or len(name) > 100:
        raise HTTPException(status_code=422, detail="Name is required (max 100 characters).")
    if not email or "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=422, detail="A valid email address is required.")
    if not subject or len(subject) > 200:
        raise HTTPException(status_code=422, detail="Subject is required (max 200 characters).")
    if not message or len(message) > 5000:
        raise HTTPException(status_code=422, detail="Message is required (max 5,000 characters).")

    if not SMTP_ENABLED:
        logger.warning(
            "Contact form submission from %s — SMTP not configured.", email
        )
        raise HTTPException(
            status_code=503,
            detail=(
                "Email delivery is not configured on this server. "
                "Please email us directly at " + (CONTACT_EMAIL or "support@orryon.com")
            ),
        )

    if not CONTACT_EMAIL:
        logger.error("CONTACT_EMAIL not set — cannot deliver contact form message from %s.", email)
        raise HTTPException(status_code=503, detail="Contact recipient not configured.")

    msg = _build_contact_email(name, email, subject, message)
    sent = _send_email(CONTACT_EMAIL, msg)

    if not sent:
        logger.error("Failed to deliver contact form email from %s to %s.", email, CONTACT_EMAIL)
        raise HTTPException(
            status_code=500,
            detail="We couldn't send your message right now. Please try again or email us directly.",
        )

    logger.info("Contact form message from %s <%s> delivered to %s.", name, email, CONTACT_EMAIL)
    return {"status": "sent", "message": "Your message has been received. We'll be in touch soon."}
