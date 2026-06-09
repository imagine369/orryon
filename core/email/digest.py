"""Scheduled digest and reminder emails."""
from __future__ import annotations

import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from config import SMTP_ENABLED, SMTP_FROM, SMTP_USER
from core.email.branding import orryon_email_header_html
from core.email.providers import send_email as _send_email

logger = logging.getLogger(__name__)

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
          {orryon_email_header_html()}
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
    sent, _ = _send_email(to_email, msg)
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
          {orryon_email_header_html()}
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
    sent, _ = _send_email(to_email, msg)
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
          {orryon_email_header_html()}
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
    sent, _ = _send_email(to_email, msg)
    if sent:
        logger.info("Weekly report sent to %s", to_email)
    return sent
