"""
Billing-aligned usage periods — usage resets on the user's subscription renewal date,
not the calendar month.
"""

from __future__ import annotations

import calendar
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from core.stripe_sync import (
    _all_stripe_customer_ids,
    _find_paid_subscription,
    _persist_paid_plan,
)

logger = logging.getLogger(__name__)

TRIAL_DAYS = 14


@dataclass(frozen=True)
class UsagePeriod:
    """Bucket key and display labels for the active billing period."""

    key: str
    reset_at: datetime
    reset_label: str
    is_trial_period: bool = False


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


def _stripe_field(obj: object, key: str):
    if obj is None:
        return None
    if isinstance(obj, dict):
        return obj.get(key)
    return getattr(obj, key, None)


def stripe_subscription_period_bounds(sub_obj: object) -> tuple[str, str]:
    """
    Extract billing_period_start/end ISO strings from a Stripe subscription.

    Stripe Basil (2025-03-31+) stores periods on subscription items, not the
    subscription root — read items first, then fall back for older API versions.
    """
    try:
        cps, cpe = None, None
        items_container = _stripe_field(sub_obj, "items")
        items = _stripe_field(items_container, "data") or []
        best_end: int | None = None
        for item in items:
            ips = _stripe_field(item, "current_period_start")
            ipe = _stripe_field(item, "current_period_end")
            if ips is None or ipe is None:
                continue
            end_ts = int(ipe)
            if best_end is None or end_ts > best_end:
                best_end = end_ts
                cps, cpe = ips, ipe
        if cps is None or cpe is None:
            cps = _stripe_field(sub_obj, "current_period_start")
            cpe = _stripe_field(sub_obj, "current_period_end")
        if cps is None or cpe is None:
            return "", ""
        start = datetime.fromtimestamp(int(cps), tz=timezone.utc).isoformat()
        end = datetime.fromtimestamp(int(cpe), tz=timezone.utc).isoformat()
        return start, end
    except Exception as exc:
        logger.warning("stripe_subscription_period_bounds: %s", exc)
        return "", ""


def sync_user_billing_row(user_row: dict) -> dict:
    """
    Ensure stripe_subscription_id and billing_period_* are set from Stripe.

    Called before resolving usage so paid users see their real renewal date.
    """
    if _parse_iso(user_row.get("billing_period_end") or "") and (
        user_row.get("stripe_subscription_id") or ""
    ).strip():
        return refresh_billing_period_from_stripe(user_row)

    from config import STRIPE_ENABLED, STRIPE_SECRET_KEY

    if not STRIPE_ENABLED:
        return user_row

    sub_id = (user_row.get("stripe_subscription_id") or "").strip()
    if sub_id:
        user_row = refresh_billing_period_from_stripe(user_row)
        if _parse_iso(user_row.get("billing_period_end") or ""):
            return user_row

    try:
        import stripe as stripe_lib
        from db import get_connection

        stripe_lib.api_key = STRIPE_SECRET_KEY
        customer_ids, user_row = _all_stripe_customer_ids(stripe_lib, user_row)
        if not customer_ids:
            return user_row
        found = _find_paid_subscription(stripe_lib, customer_ids, user_row["id"])
        if not found:
            return user_row
        customer_id, sub_id, new_plan, _price_id = found
        sub_obj = stripe_lib.Subscription.retrieve(str(sub_id))
        bps, bpe = stripe_subscription_period_bounds(sub_obj)
        _persist_paid_plan(
            user_row["id"],
            customer_id,
            sub_id,
            new_plan,
            billing_period_start=bps,
            billing_period_end=bpe,
        )
        with get_connection() as conn:
            row = conn.execute("SELECT * FROM users WHERE id=?", (user_row["id"],)).fetchone()
        return dict(row) if row else user_row
    except Exception as exc:
        logger.warning(
            "sync_user_billing_row: user=%s failed: %s",
            user_row.get("id"),
            exc,
        )
        return user_row


def refresh_billing_period_from_stripe(user_row: dict) -> dict:
    """Pull current_period_start/end from Stripe so usage resets match the real bill date."""
    sub_id = (user_row.get("stripe_subscription_id") or "").strip()
    if not sub_id:
        return user_row
    from config import STRIPE_ENABLED, STRIPE_SECRET_KEY

    if not STRIPE_ENABLED:
        return user_row
    try:
        import stripe as stripe_lib
        from db import get_connection

        stripe_lib.api_key = STRIPE_SECRET_KEY
        sub_obj = stripe_lib.Subscription.retrieve(sub_id)
        bps, bpe = stripe_subscription_period_bounds(sub_obj)
        if not bps or not bpe:
            logger.warning(
                "refresh_billing_period: no period on sub=%s user=%s",
                sub_id,
                user_row.get("id"),
            )
            return user_row
        uid = user_row["id"]
        with get_connection() as conn:
            conn.execute(
                "UPDATE users SET billing_period_start=?, billing_period_end=? WHERE id=?",
                (bps, bpe, uid),
            )
            conn.commit()
        updated = dict(user_row)
        updated["billing_period_start"] = bps
        updated["billing_period_end"] = bpe
        return updated
    except Exception as exc:
        logger.warning(
            "refresh_billing_period: user=%s sub=%s failed: %s",
            user_row.get("id"),
            sub_id,
            exc,
        )
        return user_row


def _calendar_month_period(now: datetime) -> UsagePeriod:
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    end = _add_months(start, 1)
    return _period_from_bounds(start, end)


def _period_from_bounds(
    start: datetime,
    end: datetime,
    *,
    prefix: str = "Resets",
) -> UsagePeriod:
    key = start.strftime("%Y-%m-%d")
    now = datetime.now(timezone.utc)
    days = max(0, int((end - now).total_seconds() // 86400))
    date_label = f"{end.strftime('%b')} {end.day}"
    if days > 0:
        date_label += f" ({days} day{'s' if days != 1 else ''})"
    return UsagePeriod(
        key=key,
        reset_at=end,
        reset_label=f"{prefix} {date_label}",
        is_trial_period=prefix == "Trial ends",
    )


def _rolling_monthly_period(anchor: datetime, period_end: datetime | None, now: datetime) -> UsagePeriod:
    """Use Stripe period end when valid; otherwise advance monthly from anchor."""
    if period_end and now < period_end:
        return _period_from_bounds(anchor, period_end)
    start = anchor
    end = period_end or _add_months(start, 1)
    while now >= end:
        start = end
        end = _add_months(start, 1)
    return _period_from_bounds(start, end)


def resolve_usage_period(user_row: dict, *, refresh_stripe: bool = True) -> UsagePeriod:
    """
    Return the usage bucket for *user_row*.

    Stripe billing period wins when present (paid subscribers).
    Trial-only users without Stripe billing see trial end date.
    """
    if refresh_stripe:
        user_row = sync_user_billing_row(user_row)

    now = datetime.now(timezone.utc)
    plan = (user_row.get("plan") or "free").strip()

    period_start = _parse_iso(user_row.get("billing_period_start") or "")
    period_end = _parse_iso(user_row.get("billing_period_end") or "")

    # Paid billing cycle from Stripe — applies even during trial if checkout linked a sub
    if period_start and period_end:
        period = _rolling_monthly_period(period_start, period_end, now)
        return period

    if plan == "trial":
        trial_end = _parse_iso(user_row.get("trial_ends_at") or "")
        created = _parse_iso(user_row.get("created_at") or "")
        if trial_end:
            start = trial_end - timedelta(days=TRIAL_DAYS)
            if created and created > start:
                start = created
            return _period_from_bounds(start, trial_end, prefix="Trial ends")
        if created:
            return _rolling_monthly_period(created, _add_months(created, 1), now)

    created = _parse_iso(user_row.get("created_at") or "")
    if created and plan in ("pro", "premium", "premium_plus"):
        return _rolling_monthly_period(created, None, now)

    return _calendar_month_period(now)


def resolve_usage_period_key(user_row: dict) -> str:
    return resolve_usage_period(user_row).key
