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

import json
import logging
import os
import smtplib
import urllib.request
import urllib.error
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from config import (
    RESEND_API_KEY, RESEND_ENABLED,
    SMTP_ENABLED, SMTP_FROM, SMTP_HOST, SMTP_PASS, SMTP_PORT, SMTP_USER,
)

logger = logging.getLogger(__name__)

_IS_PRODUCTION = os.getenv("NODE_ENV", "").lower() == "production"


def _send_via_resend(to_email: str, subject: str, html: str, plain: str) -> bool:
    """Send using Resend's HTTP API — works on Railway (no SMTP ports needed)."""
    payload = json.dumps({
        "from": SMTP_FROM or f"orryon <noreply@orryon.com>",
        "to": [to_email],
        "subject": subject,
        "html": html,
        "text": plain,
    }).encode()

    logger.info(
        "Resend: POST to api.resend.com/emails (from=%s, to=%s, key_len=%d, key_prefix=%s)",
        (SMTP_FROM or "noreply@orryon.com"),
        to_email,
        len(RESEND_API_KEY),
        RESEND_API_KEY[:12] if RESEND_API_KEY else "",
    )
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = resp.read().decode()
            logger.info("Resend: sent email to %s (response=%s)", to_email, body[:200])
            return True
    except urllib.error.HTTPError as exc:
        body = exc.read().decode() if exc.fp else ""
        logger.error(
            "Resend HTTP %s sending to %s. Full response: %s. Payload preview: %s",
            exc.code, to_email, body, payload.decode()[:300],
        )
        return False
    except Exception as exc:
        logger.exception("Resend error sending to %s: %s", to_email, exc)
        return False


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

def send_verification_code(to_email: str, code: str) -> dict:
    """
    Send the OTP *code* to *to_email* via SMTP.

    Returns a dict with:
        sent (bool)   — True if email was delivered
        reason (str)  — "sent", "not_configured", "auth_failed", "send_failed"
        detail (str)  — human-readable explanation
    """
    if not SMTP_ENABLED:
        if _IS_PRODUCTION:
            logger.error("SMTP not configured in production — OTP for %s cannot be delivered", to_email)
        else:
            logger.warning(
                "SMTP not configured — verification code for %s: %s  "
                "(set SMTP_HOST / SMTP_USER / SMTP_PASS in .env to send real emails)",
                to_email, code,
            )
        return {
            "sent": False,
            "reason": "not_configured",
            "detail": "SMTP not configured — set SMTP_HOST, SMTP_USER, SMTP_PASS in .env",
        }

    try:
        msg = _build_email(to_email, code)
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(SMTP_FROM or SMTP_USER, [to_email], msg.as_string())
        logger.info("Verification code sent to %s", to_email)
        return {"sent": True, "reason": "sent", "detail": f"Code sent to {to_email}"}
    except smtplib.SMTPAuthenticationError:
        logger.error(
            "SMTP authentication failed for %s — check SMTP_USER / SMTP_PASS in .env. "
            "Gmail users: use an App Password, not your regular password.",
            SMTP_USER,
        )
        return {
            "sent": False,
            "reason": "auth_failed",
            "detail": "SMTP login failed — check SMTP_USER / SMTP_PASS. Gmail users need an App Password.",
        }
    except Exception as exc:
        logger.error("Failed to send verification email to %s: %s", to_email, exc)
        return {
            "sent": False,
            "reason": "send_failed",
            "detail": f"Email send failed: {exc}",
        }


# ── Shared SMTP sender ────────────────────────────────────────────────────────

def _send_email(to_email: str, msg: MIMEMultipart) -> bool:
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
        return _send_via_resend(to_email, subject, html or plain, plain)

    if not SMTP_ENABLED:
        logger.warning(
            "Skipping email to %s: SMTP not configured (SMTP_HOST=%s SMTP_USER_set=%s "
            "SMTP_PASS_set=%s).",
            to_email,
            bool(SMTP_HOST),
            bool(SMTP_USER),
            bool(SMTP_PASS),
        )
        return False
    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(SMTP_FROM or SMTP_USER, [to_email], msg.as_string())
        logger.info("SMTP: sent email to %s via %s:%s", to_email, SMTP_HOST, SMTP_PORT)
        return True
    except smtplib.SMTPAuthenticationError as exc:
        logger.error(
            "SMTP auth failed for %s (user=%s). With Gmail you MUST use a 16-char "
            "App Password (not your account password) and 2FA must be enabled. "
            "Underlying: %s",
            SMTP_HOST,
            SMTP_USER,
            exc,
        )
        return False
    except smtplib.SMTPSenderRefused as exc:
        logger.error(
            "SMTP sender refused (%s). Likely From header (%s) does not match the "
            "authenticated user (%s) — Gmail rewrites or rejects forged senders. %s",
            SMTP_HOST,
            SMTP_FROM or SMTP_USER,
            SMTP_USER,
            exc,
        )
        return False
    except smtplib.SMTPRecipientsRefused as exc:
        logger.error("SMTP rejected recipient %s: %s", to_email, exc)
        return False
    except (smtplib.SMTPConnectError, smtplib.SMTPServerDisconnected, TimeoutError) as exc:
        logger.error(
            "SMTP connection issue to %s:%s — some hosting providers block outbound "
            "port 587. Consider switching to Resend/Postmark or opening the port. %s",
            SMTP_HOST,
            SMTP_PORT,
            exc,
        )
        return False
    except Exception as exc:
        logger.exception("Failed to send email to %s: %s", to_email, exc)
        return False


def smtp_diagnostics(to_email: str | None = None) -> dict:
    """Return a machine-readable report on email config & connectivity."""
    key_preview = (RESEND_API_KEY[:12] + "...") if len(RESEND_API_KEY) > 12 else (RESEND_API_KEY or None)
    report: dict = {
        "resend_enabled": bool(RESEND_ENABLED),
        "resend_key_preview": key_preview,
        "resend_key_length": len(RESEND_API_KEY),
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
            ok = _send_via_resend(
                to_email,
                "orryon email diagnostic test",
                "<p>If you received this, Resend is working. — orryon</p>",
                "If you received this, Resend is working. — orryon",
            )
            report["ok"] = ok
            report["sent_to"] = to_email if ok else None
            if not ok:
                report["error"] = "Resend API call failed — check logs for details."
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

def _build_reminder_email(
    to_email: str,
    event_title: str,
    event_date: str,
    event_time: str,
    minutes_before: int,
) -> MIMEMultipart:
    msg = MIMEMultipart("alternative")
    msg["From"] = SMTP_FROM or SMTP_USER
    msg["To"] = to_email

    if minutes_before <= 0:
        timing = "now"
        msg["Subject"] = f"orryon: {event_title} is happening now"
    elif minutes_before < 60:
        timing = f"in {minutes_before} minutes"
        msg["Subject"] = f"orryon: {event_title} — {timing}"
    elif minutes_before < 1440:
        hours = minutes_before // 60
        timing = f"in {hours} hour{'s' if hours > 1 else ''}"
        msg["Subject"] = f"orryon: {event_title} — {timing}"
    else:
        timing = "tomorrow"
        msg["Subject"] = f"orryon: {event_title} — {timing}"

    time_display = f" at {event_time}" if event_time else ""

    plain = (
        f"Reminder: {event_title}\n"
        f"{event_date}{time_display}\n"
        f"Starting {timing}.\n\n"
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
                           letter-spacing:-0.5px;">&#128176; orryon</span>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:8px;">
              <p style="margin:0;font-size:14px;color:#00c9ff;
                        text-transform:uppercase;letter-spacing:1px;font-weight:600;">
                Upcoming Event
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:16px 0 12px;">
              <span style="font-size:24px;font-weight:700;color:#fff;">
                {event_title}
              </span>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:20px;">
              <span style="font-size:16px;color:#94a3b8;">
                {event_date}{time_display}
              </span>
            </td>
          </tr>
          <tr>
            <td align="center">
              <div style="background:#0f2027;border:1px solid rgba(0,201,255,0.3);
                          border-radius:12px;padding:14px 20px;display:inline-block;">
                <span style="font-size:15px;color:#00c9ff;font-weight:600;">
                  Starting {timing}
                </span>
              </div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="margin:0;font-size:12px;color:#444;">
                You're receiving this because you enabled reminders in orryon.
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


def send_event_reminder(
    to_email: str,
    event_title: str,
    event_date: str,
    event_time: str,
    minutes_before: int,
) -> bool:
    """Send a reminder email for an upcoming event. Returns True on success."""
    if not SMTP_ENABLED:
        logger.info(
            "SMTP not configured — reminder for '%s' would have been sent to %s",
            event_title, to_email,
        )
        return False
    msg = _build_reminder_email(to_email, event_title, event_date, event_time, minutes_before)
    sent = _send_email(to_email, msg)
    if sent:
        logger.info("Reminder sent to %s for '%s'", to_email, event_title)
    return sent


# ── Daily Digest Email ────────────────────────────────────────────────────────

def send_daily_digest(
    to_email: str,
    user_name: str,
    events: list[dict],
    tasks: list[dict],
    bills: list[dict],
) -> bool:
    """
    Send a morning digest email summarising today's events, due tasks, and bills.
    Each item dict should have at minimum: title, and optionally time/due_date/amount.
    Returns True on success.
    """
    if not SMTP_ENABLED:
        logger.info("SMTP not configured — daily digest would have been sent to %s", to_email)
        return False

    if not events and not tasks and not bills:
        logger.info("No items for daily digest — skipping email to %s", to_email)
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"orryon: Your day ahead — {len(events)} event{'s' if len(events) != 1 else ''}, {len(tasks)} task{'s' if len(tasks) != 1 else ''}"
    msg["From"] = SMTP_FROM or SMTP_USER
    msg["To"] = to_email

    # Build plain text
    lines = [f"Good morning, {user_name}!\n", "Here's your day:\n"]
    if events:
        lines.append("EVENTS")
        for e in events:
            time_str = f" at {e.get('time', '')}" if e.get("time") else ""
            lines.append(f"  - {e['title']}{time_str}")
    if tasks:
        lines.append("\nTASKS DUE")
        for t in tasks:
            lines.append(f"  - {t['title']}")
    if bills:
        lines.append("\nBILLS DUE")
        for b in bills:
            amt = f" — ${float(b.get('amount', 0)):,.2f}" if b.get("amount") else ""
            lines.append(f"  - {b['title']}{amt}")
    lines.append("\n— orryon")
    plain = "\n".join(lines)

    # Build HTML
    events_html = ""
    if events:
        events_html = '<div style="margin-bottom:20px;">'
        events_html += '<p style="margin:0 0 8px;font-size:12px;color:#00c9ff;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Events</p>'
        for e in events:
            time_str = f' <span style="color:#64748b;">at {e.get("time", "")}</span>' if e.get("time") else ""
            events_html += (
                f'<div style="background:#0f172a;border:1px solid #1e293b;border-radius:10px;'
                f'padding:10px 14px;margin-bottom:6px;font-size:14px;color:#f1f5f9;">'
                f'&#128197; {e["title"]}{time_str}</div>'
            )
        events_html += "</div>"

    tasks_html = ""
    if tasks:
        tasks_html = '<div style="margin-bottom:20px;">'
        tasks_html += '<p style="margin:0 0 8px;font-size:12px;color:#92fe9d;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Tasks Due</p>'
        for t in tasks:
            tasks_html += (
                f'<div style="background:#0f172a;border:1px solid #1e293b;border-radius:10px;'
                f'padding:10px 14px;margin-bottom:6px;font-size:14px;color:#f1f5f9;">'
                f'&#9989; {t["title"]}</div>'
            )
        tasks_html += "</div>"

    bills_html = ""
    if bills:
        bills_html = '<div style="margin-bottom:20px;">'
        bills_html += '<p style="margin:0 0 8px;font-size:12px;color:#f59e0b;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Bills Due</p>'
        for b in bills:
            amt = f' <span style="color:#f59e0b;font-weight:700;">${float(b.get("amount", 0)):,.2f}</span>' if b.get("amount") else ""
            bills_html += (
                f'<div style="background:#0f172a;border:1px solid #1e293b;border-radius:10px;'
                f'padding:10px 14px;margin-bottom:6px;font-size:14px;color:#f1f5f9;">'
                f'&#9889; {b["title"]}{amt}</div>'
            )
        bills_html += "</div>"

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
                           letter-spacing:-0.5px;">&#128176; orryon</span>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:20px;">
              <p style="margin:0;font-size:18px;font-weight:700;color:#fff;">
                Good morning, {user_name}
              </p>
              <p style="margin:6px 0 0;font-size:13px;color:#64748b;">
                Here's what's on your plate today
              </p>
            </td>
          </tr>
          <tr><td>{events_html}{tasks_html}{bills_html}</td></tr>
          <tr>
            <td align="center" style="padding-top:16px;">
              <p style="margin:0;font-size:12px;color:#444;">
                Your daily digest from orryon. Adjust in Settings.
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
    sent = _send_email(to_email, msg)
    if sent:
        logger.info("Daily digest sent to %s", to_email)
    return sent


# ── Weekly Report Email ──────────────────────────────────────────────────────

def send_weekly_report(
    to_email: str,
    user_name: str,
    total_spent: float,
    top_categories: list[dict],
    budget_map: dict,
    goals: list[dict],
    week_start: str,
    week_end: str,
) -> bool:
    """Send a weekly spending report email."""
    if not SMTP_ENABLED:
        logger.info("SMTP not configured — weekly report would have been sent to %s", to_email)
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"orryon: Your week in review — ${total_spent:,.0f} spent"
    msg["From"] = SMTP_FROM or SMTP_USER
    msg["To"] = to_email

    lines = [f"Weekly Report for {user_name}\n", f"{week_start} to {week_end}\n"]
    lines.append(f"Total Spent: ${total_spent:,.2f}\n")
    if top_categories:
        lines.append("TOP CATEGORIES")
        for c in top_categories:
            budget = budget_map.get(c["category"], 0)
            budget_str = f" (budget: ${budget:,.0f})" if budget else ""
            lines.append(f"  - {c['category']}: ${c['total']:,.2f}{budget_str}")
    if goals:
        lines.append("\nGOAL PROGRESS")
        for g in goals:
            pct = round(float(g["current_amount"]) / float(g["target_amount"]) * 100, 0) if float(g["target_amount"]) > 0 else 0
            lines.append(f"  - {g['name']}: ${float(g['current_amount']):,.0f} / ${float(g['target_amount']):,.0f} ({pct:.0f}%)")
    lines.append("\n— orryon")
    plain = "\n".join(lines)

    cats_html = ""
    if top_categories:
        cats_html = '<div style="margin-bottom:20px;">'
        cats_html += '<p style="margin:0 0 8px;font-size:12px;color:#00c9ff;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Top Categories</p>'
        for c in top_categories:
            budget = budget_map.get(c["category"], 0)
            pct = round(c["total"] / budget * 100, 0) if budget else 0
            bar_color = "#22c55e" if pct < 80 else "#f59e0b" if pct < 100 else "#ef4444"
            bar_w = min(100, pct) if budget else 50
            budget_str = f'<span style="color:#64748b;font-size:12px;"> / ${budget:,.0f}</span>' if budget else ""
            cats_html += (
                f'<div style="background:#0f172a;border:1px solid #1e293b;border-radius:10px;'
                f'padding:10px 14px;margin-bottom:6px;">'
                f'<div style="display:flex;justify-content:space-between;font-size:14px;color:#f1f5f9;margin-bottom:4px;">'
                f'<span>{c["category"]}</span><span>${c["total"]:,.2f}{budget_str}</span></div>'
                f'<div style="background:#1e293b;border-radius:4px;height:4px;">'
                f'<div style="width:{bar_w}%;height:4px;border-radius:4px;background:{bar_color};"></div>'
                f'</div></div>'
            )
        cats_html += "</div>"

    goals_html = ""
    if goals:
        goals_html = '<div style="margin-bottom:20px;">'
        goals_html += '<p style="margin:0 0 8px;font-size:12px;color:#92fe9d;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Goal Progress</p>'
        for g in goals:
            pct = round(float(g["current_amount"]) / float(g["target_amount"]) * 100, 0) if float(g["target_amount"]) > 0 else 0
            goals_html += (
                f'<div style="background:#0f172a;border:1px solid #1e293b;border-radius:10px;'
                f'padding:10px 14px;margin-bottom:6px;font-size:14px;color:#f1f5f9;">'
                f'🎯 {g["name"]} — {pct:.0f}% (${float(g["current_amount"]):,.0f} / ${float(g["target_amount"]):,.0f})'
                f'</div>'
            )
        goals_html += "</div>"

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
              <span style="font-size:28px;font-weight:700;letter-spacing:-0.5px;">&#128176; orryon</span>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:20px;">
              <p style="margin:0;font-size:18px;font-weight:700;color:#fff;">
                Week in Review
              </p>
              <p style="margin:6px 0 0;font-size:13px;color:#64748b;">
                {week_start} to {week_end}
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:20px;">
              <div style="background:#0f2027;border:1px solid rgba(0,201,255,0.3);
                          border-radius:12px;padding:14px 20px;display:inline-block;">
                <span style="font-size:28px;font-weight:800;color:#00c9ff;">
                  ${total_spent:,.2f}
                </span>
                <span style="font-size:13px;color:#64748b;display:block;margin-top:4px;">
                  total spent this week
                </span>
              </div>
            </td>
          </tr>
          <tr><td>{cats_html}{goals_html}</td></tr>
          <tr>
            <td align="center" style="padding-top:16px;">
              <p style="margin:0;font-size:12px;color:#444;">
                Your weekly report from orryon. Adjust in Settings.
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
    sent = _send_email(to_email, msg)
    if sent:
        logger.info("Weekly report sent to %s", to_email)
    return sent
