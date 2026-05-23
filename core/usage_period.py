"""
Billing-aligned usage periods — usage resets on the user's subscription renewal date,
not the calendar month.
"""

from __future__ import annotations

import calendar
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)

TRIAL_DAYS = 14


@dataclass(frozen=True)
class UsagePeriod:
    """Bucket key and display labels for the active billing period."""

    key: str
    reset_at: datetime
    reset_label: str


def _add_months(dt: datetime, months: int) -> datetime:
    month = dt.month - 1 + months
    year = dt.year + month // 12
    month = month % 12 + 1
    day = min(dt.day, calendar.monthrange(year, month)[1])
    return dt.replace(year=year, month=month, day=day)


def _parse_iso(value: str) -> datetime | None:
    if not value or not value.strip():
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def _calendar_month_period(now: datetime) -> UsagePeriod:
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    end = _add_months(start, 1)
    return _period_from_bounds(start, end)


def _period_from_bounds(start: datetime, end: datetime) -> UsagePeriod:
    key = start.strftime("%Y-%m-%d")
    now = datetime.now(timezone.utc)
    days = max(0, int((end - now).total_seconds() // 86400))
    reset_label = f"{end.strftime('%b')} {end.day}"
    if days > 0:
        reset_label += f" ({days} day{'s' if days != 1 else ''})"
    return UsagePeriod(key=key, reset_at=end, reset_label=f"Resets {reset_label}")


def _rolling_monthly_period(anchor: datetime, period_end: datetime | None, now: datetime) -> UsagePeriod:
    """Advance 1-month windows from anchor until *now* is inside [start, end)."""
    start = anchor
    end = period_end or _add_months(start, 1)
    while now >= end:
        start = end
        end = _add_months(start, 1)
    return _period_from_bounds(start, end)


def resolve_usage_period(user_row: dict) -> UsagePeriod:
    """
    Return the usage bucket for *user_row*.

    Paid Stripe subscribers: anchor on billing_period_start (from Stripe period).
    Trial: anchor on trial start (trial end minus trial length, or account created_at).
    Free / past_due: calendar month.
    """
    now = datetime.now(timezone.utc)
    plan = (user_row.get("plan") or "free").strip()

    period_start = _parse_iso(user_row.get("billing_period_start") or "")
    period_end = _parse_iso(user_row.get("billing_period_end") or "")

    if period_start and plan in ("pro", "premium", "premium_plus", "past_due"):
        return _rolling_monthly_period(period_start, period_end, now)

    if plan == "trial":
        trial_end = _parse_iso(user_row.get("trial_ends_at") or "")
        created = _parse_iso(user_row.get("created_at") or "")
        if trial_end:
            start = trial_end - timedelta(days=TRIAL_DAYS)
            if created and created > start:
                start = created
            return _period_from_bounds(start, trial_end)
        if created:
            return _rolling_monthly_period(created, _add_months(created, 1), now)

    created = _parse_iso(user_row.get("created_at") or "")
    if created and plan in ("pro", "premium", "premium_plus"):
        return _rolling_monthly_period(created, None, now)

    return _calendar_month_period(now)


def resolve_usage_period_key(user_row: dict) -> str:
    return resolve_usage_period(user_row).key


def stripe_subscription_period_bounds(sub_obj: dict) -> tuple[str, str]:
    """Extract billing_period_start/end ISO strings from a Stripe subscription object."""
    try:
        cps = sub_obj.get("current_period_start")
        cpe = sub_obj.get("current_period_end")
        if not cps or not cpe:
            return "", ""
        start = datetime.fromtimestamp(int(cps), tz=timezone.utc).isoformat()
        end = datetime.fromtimestamp(int(cpe), tz=timezone.utc).isoformat()
        return start, end
    except Exception as exc:
        logger.warning("stripe_subscription_period_bounds: %s", exc)
        return "", ""
