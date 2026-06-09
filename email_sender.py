"""
email_sender.py — Backward-compatible re-exports.

New code should import from ``core.email`` directly.
"""

from core.email import (
    _send_email,
    orryon_email_header_html,
    send_daily_digest,
    send_event_reminder,
    send_verification_code,
    send_weekly_report,
    smtp_diagnostics,
)

__all__ = [
    "_send_email",
    "orryon_email_header_html",
    "send_daily_digest",
    "send_event_reminder",
    "send_verification_code",
    "send_weekly_report",
    "smtp_diagnostics",
]
