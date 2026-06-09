"""Orryon outbound email (OTP, digests, contact, providers)."""

from core.email.branding import orryon_email_header_html
from core.email.contact import build_contact_email
from core.email.digest import send_daily_digest, send_event_reminder, send_weekly_report
from core.email.otp import send_verification_code
from core.email.providers import send_email, smtp_diagnostics

# Backward-compatible private alias used by routers.
_send_email = send_email

__all__ = [
    "_send_email",
    "build_contact_email",
    "orryon_email_header_html",
    "send_daily_digest",
    "send_email",
    "send_event_reminder",
    "send_verification_code",
    "send_weekly_report",
    "smtp_diagnostics",
]
