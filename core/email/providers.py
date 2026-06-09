"""Resend + SMTP delivery and diagnostics."""
from __future__ import annotations

import json
import logging
import smtplib
import urllib.error
import urllib.request
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from config import (
    RESEND_API_KEY,
    RESEND_ENABLED,
    SMTP_ENABLED,
    SMTP_FROM,
    SMTP_HOST,
    SMTP_PASS,
    SMTP_PORT,
    SMTP_USER,
)
logger = logging.getLogger(__name__)

def send_via_resend(to_email: str, subject: str, html: str, plain: str) -> tuple[bool, str]:
    """Send using Resend's HTTP API — works on Railway (no SMTP ports needed)."""
    payload = json.dumps({
        "from": SMTP_FROM or f"orryon <noreply@orryon.com>",
        "to": [to_email],
        "subject": subject,
        "html": html,
        "text": plain,
    }).encode()

    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json",
            # Resend fronts the API with Cloudflare; the default urllib UA
            # (`Python-urllib/3.x`) trips Cloudflare's bot protection (error 1010).
            "User-Agent": "orryon/1.0 (+https://orryon.com)",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = resp.read().decode()
            logger.info("Resend: sent email to %s (id=%s)", to_email, json.loads(body).get("id"))
            return True, ""
    except urllib.error.HTTPError as exc:
        body = exc.read().decode() if exc.fp else ""
        logger.error("Resend HTTP %s sending to %s: %s", exc.code, to_email, body)
        detail = body[:240] if body else str(exc)
        return False, f"Resend error {exc.code}: {detail}"
    except Exception as exc:
        logger.exception("Resend error sending to %s: %s", to_email, exc)
        return False, str(exc)[:240]


# ── Email templates ───────────────────────────────────────────────────────────


def send_email(to_email: str, msg: MIMEMultipart) -> tuple[bool, str]:
    """Send an already-built MIMEMultipart message.

    Prefers Resend HTTP API (RESEND_API_KEY) over SMTP — Resend works on Railway
    where outbound SMTP ports are blocked.
    """
    if RESEND_ENABLED:
        subject = msg.get("Subject", "")
        html = ""
        plain = ""
        for part in msg.walk():
            ct = part.get_content_type()
            if ct == "text/html":
                html = part.get_payload(decode=True).decode("utf-8", errors="replace")
            elif ct == "text/plain":
                plain = part.get_payload(decode=True).decode("utf-8", errors="replace")
        ok, detail = send_via_resend(to_email, subject, html or plain, plain)
        return ok, detail

    if not SMTP_ENABLED:
        logger.warning(
            "Skipping email to %s: SMTP not configured (SMTP_HOST=%s SMTP_USER_set=%s "
            "SMTP_PASS_set=%s).",
            to_email,
            bool(SMTP_HOST),
            bool(SMTP_USER),
            bool(SMTP_PASS),
        )
        return False, "SMTP not configured on server"
    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(SMTP_FROM or SMTP_USER, [to_email], msg.as_string())
        logger.info("SMTP: sent email to %s via %s:%s", to_email, SMTP_HOST, SMTP_PORT)
        return True, ""
    except smtplib.SMTPAuthenticationError as exc:
        logger.error(
            "SMTP auth failed for %s (user=%s). With Gmail you MUST use a 16-char "
            "App Password (not your account password) and 2FA must be enabled. "
            "Underlying: %s",
            SMTP_HOST,
            SMTP_USER,
            exc,
        )
        return False, f"SMTP authentication failed: {exc}"
    except smtplib.SMTPSenderRefused as exc:
        logger.error(
            "SMTP sender refused (%s). Likely From header (%s) does not match the "
            "authenticated user (%s) — Gmail rewrites or rejects forged senders. %s",
            SMTP_HOST,
            SMTP_FROM or SMTP_USER,
            SMTP_USER,
            exc,
        )
        return False, f"SMTP sender refused: {exc}"
    except smtplib.SMTPRecipientsRefused as exc:
        logger.error("SMTP rejected recipient %s: %s", to_email, exc)
        return False, f"SMTP rejected recipient: {exc}"
    except (smtplib.SMTPConnectError, smtplib.SMTPServerDisconnected, TimeoutError) as exc:
        logger.error(
            "SMTP connection issue to %s:%s — some hosting providers block outbound "
            "port 587. Consider switching to Resend/Postmark or opening the port. %s",
            SMTP_HOST,
            SMTP_PORT,
            exc,
        )
        return False, f"SMTP connection failed: {exc}"
    except Exception as exc:
        logger.exception("Failed to send email to %s: %s", to_email, exc)
        return False, str(exc)[:240]



def smtp_diagnostics(to_email: str | None = None) -> dict:
    """Return a machine-readable report on email config & connectivity."""
    report: dict = {
        "resend_enabled": bool(RESEND_ENABLED),
        "smtp_enabled": bool(SMTP_ENABLED),
        "smtp_host": SMTP_HOST or None,
        "smtp_port": SMTP_PORT or None,
        "smtp_user_set": bool(SMTP_USER),
        "smtp_pass_set": bool(SMTP_PASS),
        "smtp_from": SMTP_FROM or SMTP_USER or None,
        "stage": "start",
        "ok": False,
        "error": None,
        "sent_to": None,
    }

    if RESEND_ENABLED:
        report["stage"] = "resend_send"
        if to_email:
            ok, err = send_via_resend(
                to_email,
                "orryon email diagnostic test",
                "<p>If you received this, Resend is working. — orryon</p>",
                "If you received this, Resend is working. — orryon",
            )
            report["ok"] = ok
            report["sent_to"] = to_email if ok else None
            if not ok:
                report["error"] = err or "Resend API call failed — check logs for details."
        else:
            report["ok"] = True
            report["stage"] = "resend_configured"
        return report

    if not SMTP_ENABLED:
        report["error"] = (
            "Neither RESEND_API_KEY nor SMTP is fully configured. "
            "Set RESEND_API_KEY (recommended) or SMTP_HOST/SMTP_USER/SMTP_PASS."
        )
        return report
    try:
        report["stage"] = "connect"
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as server:
            server.ehlo()
            report["stage"] = "starttls"
            server.starttls()
            server.ehlo()
            report["stage"] = "login"
            server.login(SMTP_USER, SMTP_PASS)
            if to_email:
                report["stage"] = "send"
                msg = MIMEMultipart("alternative")
                msg["Subject"] = "orryon SMTP diagnostic test"
                msg["From"] = SMTP_FROM or SMTP_USER
                msg["To"] = to_email
                msg.attach(MIMEText(
                    "If you received this, your SMTP credentials work. — orryon",
                    "plain",
                ))
                server.sendmail(SMTP_FROM or SMTP_USER, [to_email], msg.as_string())
                report["sent_to"] = to_email
        report["stage"] = "done"
        report["ok"] = True
        return report
    except smtplib.SMTPAuthenticationError as exc:
        report["error"] = (
            f"auth_failed: {exc}. For Gmail: enable 2-Step Verification, then create "
            "an App Password at https://myaccount.google.com/apppasswords and paste "
            "the 16-char password (spaces ok) into SMTP_PASS."
        )
        return report
    except smtplib.SMTPSenderRefused as exc:
        report["error"] = (
            f"sender_refused: {exc}. From header must match the authenticated SMTP "
            "user, or your Google Workspace must allow alias sending."
        )
        return report
    except (smtplib.SMTPConnectError, smtplib.SMTPServerDisconnected, TimeoutError) as exc:
        report["error"] = (
            f"connection_failed: {exc}. The host may be blocking outbound SMTP on "
            f"port {SMTP_PORT}. Railway allows 587; if you changed ports or are on a "
            "restricted platform, switch to a transactional provider (Resend, Postmark)."
        )
        return report
    except Exception as exc:
        report["error"] = f"{type(exc).__name__}: {exc}"
        return report


# ── Event Reminder Email ──────────────────────────────────────────────────────

