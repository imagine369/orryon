"""
core/scheduler.py — Background scheduler for automated jobs.

Jobs:
  1. check_reminders   — every 60s, finds events whose reminder window has arrived
  2. check_daily_digest — every 60s, sends a morning digest at the user's configured time
  3. snapshot_net_worth — every 6 hours, takes daily NW snapshots for all users
  4. advance_bill_dates — every 60s, rolls forward past-due recurring bill dates
  5. send_weekly_report — every 60s (fires once per week per user)

Started from FastAPI lifespan in backend/main.py (idempotent).
"""

from __future__ import annotations

import calendar
import logging
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.background import BackgroundScheduler

from config import SMTP_ENABLED
from db import (
    get_connection,
    insert_row,
    update_row,
)
from db.finance import snapshot_net_worth

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def start_scheduler() -> None:
    """Start the background scheduler (idempotent — safe to call multiple times)."""
    global _scheduler
    if _scheduler is not None:
        return

    _scheduler = BackgroundScheduler(daemon=True)

    # Data jobs (always run — no SMTP needed)
    _scheduler.add_job(snapshot_all_net_worth, "interval", hours=6, id="snapshot_nw")
    _scheduler.add_job(advance_bill_dates, "interval", seconds=60, id="advance_bills")
    _scheduler.add_job(run_daily_backup, "cron", hour=3, minute=0, id="daily_backup")

    # Email jobs (only if SMTP is configured)
    if SMTP_ENABLED:
        _scheduler.add_job(check_reminders, "interval", seconds=60, id="check_reminders")
        _scheduler.add_job(check_daily_digest, "interval", seconds=60, id="check_daily_digest")
        _scheduler.add_job(send_weekly_reports, "interval", seconds=60, id="weekly_reports")

    _scheduler.start()
    logger.info("Scheduler started (SMTP=%s)", SMTP_ENABLED)


def stop_scheduler() -> None:
    """Gracefully stop the scheduler."""
    global _scheduler
    if _scheduler:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        logger.info("Scheduler stopped")


# ─────────────────────────────────────────────────────────────────────────────
# Job: Net Worth Snapshots
# ─────────────────────────────────────────────────────────────────────────────

def snapshot_all_net_worth() -> None:
    """Take a daily NW snapshot for every user who has accounts."""
    try:
        conn = get_connection()
        users = conn.execute(
            "SELECT DISTINCT user_id FROM accounts"
        ).fetchall()
        conn.close()
        for u in users:
            snapshot_net_worth(u["user_id"])
    except Exception as exc:
        logger.error("snapshot_all_net_worth error: %s", exc)


# ─────────────────────────────────────────────────────────────────────────────
# Job: Bill Date Auto-Advance
# ─────────────────────────────────────────────────────────────────────────────

def advance_bill_dates() -> None:
    """Roll forward next_due for active bills whose due date has passed."""
    try:
        conn = get_connection()
        today = datetime.now().strftime("%Y-%m-%d")
        overdue = conn.execute(
            "SELECT * FROM subscriptions WHERE is_active=1 AND next_due < ?",
            (today,),
        ).fetchall()
        conn.close()

        for bill in overdue:
            freq = (bill["frequency"] or "monthly").lower()
            old_due = bill["next_due"]
            try:
                due_dt = datetime.strptime(old_due, "%Y-%m-%d")
            except (ValueError, TypeError):
                continue

            now = datetime.now()
            if freq == "weekly":
                while due_dt.strftime("%Y-%m-%d") < today:
                    due_dt += timedelta(days=7)
            elif freq == "bi-weekly":
                while due_dt.strftime("%Y-%m-%d") < today:
                    due_dt += timedelta(days=14)
            elif freq == "yearly":
                while due_dt.strftime("%Y-%m-%d") < today:
                    try:
                        due_dt = due_dt.replace(year=due_dt.year + 1)
                    except ValueError:
                        due_dt = due_dt.replace(year=due_dt.year + 1, day=28)
            else:  # monthly
                while due_dt.strftime("%Y-%m-%d") < today:
                    month = due_dt.month + 1
                    year = due_dt.year
                    if month > 12:
                        month = 1
                        year += 1
                    day = min(due_dt.day, calendar.monthrange(year, month)[1])
                    due_dt = due_dt.replace(year=year, month=month, day=day)

            new_due = due_dt.strftime("%Y-%m-%d")
            if new_due != old_due:
                update_row("subscriptions", {"next_due": new_due}, {"id": bill["id"]})
                logger.info("Advanced bill '%s' from %s to %s", bill["name"], old_due, new_due)

    except Exception as exc:
        logger.error("advance_bill_dates error: %s", exc)


# ─────────────────────────────────────────────────────────────────────────────
# Job: Per-event reminders
# ─────────────────────────────────────────────────────────────────────────────

def check_reminders() -> None:
    """Find events whose reminder window has arrived and send emails."""
    try:
        conn = get_connection()
        now = datetime.now()
        today = now.strftime("%Y-%m-%d")

        events = conn.execute(
            """
            SELECT e.*, u.email
            FROM events e
            JOIN users u ON e.user_id = u.id
            WHERE e.reminder_minutes > 0
              AND e.reminder_sent = 0
              AND e.event_date >= ?
            ORDER BY e.event_date ASC
            """,
            (today,),
        ).fetchall()
        conn.close()

        for e in events:
            event_dt = _parse_event_datetime(e["event_date"])
            if event_dt is None:
                continue

            reminder_time = event_dt - timedelta(minutes=int(e["reminder_minutes"]))
            if now >= reminder_time:
                date_str = event_dt.strftime("%A, %B %-d, %Y")
                time_str = event_dt.strftime("%-I:%M %p") if len(e["event_date"] or "") > 10 else ""

                from email_sender import send_event_reminder
                sent = send_event_reminder(
                    to_email=e["email"],
                    event_title=e["title"],
                    event_date=date_str,
                    event_time=time_str,
                    minutes_before=int(e["reminder_minutes"]),
                )
                update_row("events", {"reminder_sent": 1}, {"id": e["id"]})
                if sent:
                    logger.info("Reminder sent for '%s' to %s", e["title"], e["email"])

    except Exception as exc:
        logger.error("check_reminders error: %s", exc)


# ─────────────────────────────────────────────────────────────────────────────
# Job: Daily digest
# ─────────────────────────────────────────────────────────────────────────────

def check_daily_digest() -> None:
    """Send daily digest emails at each user's configured time."""
    try:
        conn = get_connection()
        now = datetime.now()
        current_time = now.strftime("%H:%M")
        today = now.strftime("%Y-%m-%d")

        users = conn.execute(
            """
            SELECT * FROM users
            WHERE daily_digest_enabled = 1
              AND (last_digest_sent IS NULL OR last_digest_sent < ?)
            """,
            (today,),
        ).fetchall()

        for user in users:
            digest_time = user["daily_digest_time"] or "08:00"
            if current_time < digest_time:
                continue

            events = conn.execute(
                "SELECT title, event_date FROM events WHERE user_id=? AND event_date LIKE ? ORDER BY event_date ASC",
                (user["id"], f"{today}%"),
            ).fetchall()
            tasks = conn.execute(
                "SELECT title FROM action_items WHERE user_id=? AND status='open' AND (due_date=? OR due_date='') ORDER BY priority DESC LIMIT 10",
                (user["id"], today),
            ).fetchall()
            bills = conn.execute(
                "SELECT name as title, amount FROM subscriptions WHERE user_id=? AND is_active=1 AND next_due=? ORDER BY amount DESC",
                (user["id"], today),
            ).fetchall()

            event_list = []
            for ev in events:
                time_str = ""
                if ev["event_date"] and len(ev["event_date"]) > 10:
                    time_str = ev["event_date"][11:16]
                event_list.append({"title": ev["title"], "time": time_str})

            task_list = [{"title": t["title"]} for t in tasks]
            bill_list = [{"title": b["title"], "amount": b["amount"]} for b in bills]

            if not event_list and not task_list and not bill_list:
                update_row("users", {"last_digest_sent": today}, {"id": user["id"]})
                continue

            from email_sender import send_daily_digest
            sent = send_daily_digest(
                to_email=user["email"],
                user_name=user["display_name"] or user["email"].split("@")[0],
                events=event_list,
                tasks=task_list,
                bills=bill_list,
            )
            update_row("users", {"last_digest_sent": today}, {"id": user["id"]})
            if sent:
                logger.info("Daily digest sent to %s", user["email"])

        conn.close()

    except Exception as exc:
        logger.error("check_daily_digest error: %s", exc)


# ─────────────────────────────────────────────────────────────────────────────
# Job: Weekly Reports
# ─────────────────────────────────────────────────────────────────────────────

def send_weekly_reports() -> None:
    """Send weekly spending reports every Monday."""
    try:
        now = datetime.now()
        if now.weekday() != 0:  # Monday only
            return

        today = now.strftime("%Y-%m-%d")
        conn = get_connection()
        users = conn.execute(
            "SELECT * FROM users WHERE weekly_report_enabled = 1 AND (last_weekly_report IS NULL OR last_weekly_report < ?)",
            (today,),
        ).fetchall()

        for user in users:
            week_start = (now - timedelta(days=7)).strftime("%Y-%m-%d")
            week_end = (now - timedelta(days=1)).strftime("%Y-%m-%d")

            spent_rows = conn.execute(
                "SELECT category, SUM(amount) as total FROM transactions "
                "WHERE user_id=? AND date>=? AND date<=? AND amount>0 GROUP BY category ORDER BY total DESC",
                (user["id"], week_start, week_end),
            ).fetchall()

            total_spent = sum(float(r["total"]) for r in spent_rows)
            top_cats = [{"category": r["category"], "total": float(r["total"])} for r in spent_rows[:5]]

            budgets = conn.execute(
                "SELECT category, planned FROM budget_categories WHERE user_id=? AND month=?",
                (user["id"], now.strftime("%Y-%m")),
            ).fetchall()
            budget_map = {b["category"]: float(b["planned"]) for b in budgets}

            goals = conn.execute(
                "SELECT name, target_amount, current_amount FROM goals WHERE user_id=? AND is_completed=0",
                (user["id"],),
            ).fetchall()

            from email_sender import send_weekly_report
            sent = send_weekly_report(
                to_email=user["email"],
                user_name=user["display_name"] or user["email"].split("@")[0],
                total_spent=total_spent,
                top_categories=top_cats,
                budget_map=budget_map,
                goals=[dict(g) for g in goals],
                week_start=week_start,
                week_end=week_end,
            )
            update_row("users", {"last_weekly_report": today}, {"id": user["id"]})
            if sent:
                logger.info("Weekly report sent to %s", user["email"])

        conn.close()

    except Exception as exc:
        logger.error("send_weekly_reports error: %s", exc)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _parse_event_datetime(event_date: str) -> datetime | None:
    """Parse an event_date string like '2026-04-15 14:00' into a datetime."""
    if not event_date:
        return None
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(event_date.strip(), fmt)
        except ValueError:
            continue
    return None


def run_daily_backup() -> None:
    """Take a daily SQLite backup (runs at 3 AM UTC via scheduler)."""
    try:
        from core.backup import backup_database
        result = backup_database()
        if result:
            logger.info("Daily backup completed: %s", result)
        else:
            logger.error("Daily backup failed")
    except Exception as exc:
        logger.error("run_daily_backup error: %s", exc)
