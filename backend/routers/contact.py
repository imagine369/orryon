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
import re
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from backend.cache import check_rate_limit_async
from core.email import _send_email, build_contact_email
from config import SMTP_ENABLED, SMTP_USER

router = APIRouter(tags=["contact"])
logger = logging.getLogger(__name__)

# Recipient address — who receives the contact form messages
CONTACT_EMAIL: str = os.getenv("CONTACT_EMAIL", "") or SMTP_USER

# Anything that could inject MIME headers when embedded verbatim in a header
# (CR, LF, or standalone NULs). We reject the submission rather than silently
# stripping so an attacker can't split headers.
_HEADER_INJECTION_RE = re.compile(r"[\r\n\x00]")


def _assert_header_safe(value: str, field: str) -> None:
    if _HEADER_INJECTION_RE.search(value):
        raise HTTPException(status_code=422, detail=f"{field} contains invalid characters.")


# ── Request model ─────────────────────────────────────────────────────────────

class ContactRequest(BaseModel):
    name: str
    email: str
    subject: str
    message: str


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.post("/api/contact")
async def submit_contact(body: ContactRequest, request: Request):
    """
    Receive a contact form submission and email it to CONTACT_EMAIL via SMTP.
    No authentication required — this is a public endpoint.
    """
    client_ip = (request.client.host if request.client else "unknown") or "unknown"

    # Rate limit: 3 submissions per 10 minutes per IP, 20 per day globally.
    # (Redis-backed when configured, in-memory fallback otherwise.)
    if not await check_rate_limit_async(f"contact:ip:{client_ip}", limit=3, window_seconds=600):
        raise HTTPException(status_code=429, detail="Too many contact submissions — please try again later.")
    if not await check_rate_limit_async("contact:global", limit=40, window_seconds=3600):
        logger.warning("Global contact form rate limit hit (ip=%s).", client_ip)
        raise HTTPException(status_code=429, detail="The contact form is temporarily paused — please try again later.")

    name = body.name.strip()
    email = body.email.strip().lower()
    subject = body.subject.strip()
    message = body.message.strip()

    # Input validation
    if not name or len(name) > 100:
        raise HTTPException(status_code=422, detail="Name is required (max 100 characters).")
    if not email or "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=422, detail="A valid email address is required.")
    if len(email) > 254:
        raise HTTPException(status_code=422, detail="Email address is too long.")
    if not subject or len(subject) > 200:
        raise HTTPException(status_code=422, detail="Subject is required (max 200 characters).")
    if not message or len(message) > 5000:
        raise HTTPException(status_code=422, detail="Message is required (max 5,000 characters).")

    # Header-injection guard — these land in MIME headers (Reply-To, Subject).
    _assert_header_safe(email, "Email")
    _assert_header_safe(subject, "Subject")
    _assert_header_safe(name, "Name")

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

    msg = build_contact_email(
        recipient=CONTACT_EMAIL,
        name=name,
        sender_email=email,
        subject=subject,
        message=message,
    )
    sent, _ = _send_email(CONTACT_EMAIL, msg)

    if not sent:
        logger.error("Failed to deliver contact form email from %s to %s.", email, CONTACT_EMAIL)
        raise HTTPException(
            status_code=500,
            detail="We couldn't send your message right now. Please try again or email us directly.",
        )

    logger.info("Contact form message from %s <%s> delivered to %s.", name, email, CONTACT_EMAIL)
    return {"status": "sent", "message": "Your message has been received. We'll be in touch soon."}
