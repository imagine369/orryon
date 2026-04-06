"""
email_sender.py — Send OTP verification codes via SMTP.

Works with any SMTP provider:
  Gmail   : smtp.gmail.com         port 587
  Outlook : smtp-mail.outlook.com  port 587
  iCloud  : smtp.mail.me.com       port 587
  Yahoo   : smtp.mail.yahoo.com    port 587
  Custom  : set SMTP_HOST / SMTP_PORT in .env

If SMTP is not configured (no SMTP_HOST / SMTP_USER / SMTP_PASS in .env),
the code is returned so the caller can display it on-screen — useful for
local development without an email account set up.

Public API
──────────
  send_verification_code(to_email, code) -> bool
      Returns True if the email was sent, False if SMTP is not configured
      or an error occurred. Raises nothing — errors are logged.
"""

from __future__ import annotations

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from config import SMTP_ENABLED, SMTP_FROM, SMTP_HOST, SMTP_PASS, SMTP_PORT, SMTP_USER

logger = logging.getLogger(__name__)


# ── Email templates ───────────────────────────────────────────────────────────

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
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <span style="font-size:28px;font-weight:700;
                           letter-spacing:-0.5px;">💰 orryon</span>
            </td>
          </tr>
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

def send_verification_code(to_email: str, code: str) -> bool:
    """
    Send the OTP *code* to *to_email* via SMTP.

    Returns:
        True  — email sent successfully
        False — SMTP not configured or send failed (code shown on-screen instead)
    """
    if not SMTP_ENABLED:
        logger.warning(
            "SMTP not configured — verification code for %s: %s  "
            "(set SMTP_HOST / SMTP_USER / SMTP_PASS in .env to send real emails)",
            to_email, code,
        )
        return False

    try:
        msg = _build_email(to_email, code)
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(SMTP_FROM or SMTP_USER, [to_email], msg.as_string())
        logger.info("Verification code sent to %s", to_email)
        return True
    except smtplib.SMTPAuthenticationError:
        logger.error(
            "SMTP authentication failed for %s — check SMTP_USER / SMTP_PASS in .env. "
            "Gmail users: use an App Password, not your regular password.",
            SMTP_USER,
        )
        return False
    except Exception as exc:
        logger.error("Failed to send verification email to %s: %s", to_email, exc)
        return False
