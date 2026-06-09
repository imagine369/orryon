"""OTP / verification email."""
from __future__ import annotations

import logging
import os
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from config import RESEND_ENABLED, SMTP_ENABLED, SMTP_FROM, SMTP_USER
from core.email.branding import orryon_email_header_html
from core.email.providers import send_email as _send_email

logger = logging.getLogger(__name__)
_IS_PRODUCTION = os.getenv("NODE_ENV", "").lower() == "production"

def _build_email(to_email: str, code: str) -> MIMEMultipart:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"{code} is your orryon verification code"
    msg["From"] = SMTP_FROM or SMTP_USER
    msg["To"] = to_email

    plain = (
        f"Your orryon verification code is: {code}\n\n"
        "This code expires in 10 minutes and can only be used once.\n\n"
        "If you didn't request this, you can ignore this email.\n\n"
        "— orryon"
    )

    html = f"""
<!DOCTYPE html>
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
              <p style="margin:0;font-size:16px;color:#aaa;">
                Your verification code
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 0 28px;">
              <span style="font-size:42px;font-weight:700;
                           letter-spacing:10px;color:#fff;">
                {code}
              </span>
            </td>
          </tr>
          <tr>
            <td align="center">
              <p style="margin:0;font-size:13px;color:#666;line-height:1.6;">
                Expires in <strong style="color:#aaa;">10 minutes</strong>
                &nbsp;·&nbsp; Single use only
              </p>
              <p style="margin:12px 0 0;font-size:12px;color:#444;">
                If you didn't request this, ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""

    msg.attach(MIMEText(plain, "plain"))
    msg.attach(MIMEText(html, "html"))
    return msg


# ── Public API ────────────────────────────────────────────────────────────────


def send_verification_code(to_email: str, code: str) -> dict:
    """
    Send the OTP *code* to *to_email*.

    Routes through `_send_email`, which prefers the Resend HTTP API when
    ``RESEND_API_KEY`` is set (works on Railway / Fly / Render where outbound
    SMTP is often blocked) and falls back to classic SMTP otherwise.

    Returns a dict with:
        sent (bool)   — True if email was delivered
        reason (str)  — "sent", "not_configured", "send_failed"
        detail (str)  — human-readable explanation
    """
    if not RESEND_ENABLED and not SMTP_ENABLED:
        if _IS_PRODUCTION:
            logger.error(
                "No email provider configured in production — OTP for %s cannot be delivered",
                to_email,
            )
        else:
            logger.warning(
                "No email provider configured — verification code for %s: %s  "
                "(set RESEND_API_KEY or SMTP_HOST/USER/PASS in .env to send real emails)",
                to_email, code,
            )
        return {
            "sent": False,
            "reason": "not_configured",
            "detail": (
                "Email delivery isn't configured — set RESEND_API_KEY (recommended) "
                "or SMTP_HOST/SMTP_USER/SMTP_PASS on the server."
            ),
        }

    msg = _build_email(to_email, code)
    ok, provider_detail = _send_email(to_email, msg)
    if ok:
        logger.info("Verification code sent to %s", to_email)
        return {"sent": True, "reason": "sent", "detail": f"Code sent to {to_email}"}

    return {
        "sent": False,
        "reason": "send_failed",
        "detail": provider_detail or (
            "Email provider rejected the request. If this keeps happening, "
            "contact support@orryon.com."
        ),
    }


# ── Shared SMTP sender ────────────────────────────────────────────────────────

