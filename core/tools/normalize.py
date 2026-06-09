"""Argument normalisation before dispatch.

All tool argument coercion (dates, amounts, categories, moods, frequencies) belongs
here — not in individual handlers. See docs/ADDING_A_TOOL.md step 8.
"""
from __future__ import annotations

import json
import logging
import re
import uuid
from datetime import datetime, timedelta, timezone
from difflib import get_close_matches

try:
    import dateparser as _dateparser
except Exception:
    _dateparser = None

from db import (
    delete_row,
    fetch_rows,
    get_connection,
    insert_row,
    update_row,
)
from db.finance import (
    adjust_balance,
    get_balance,
    get_or_create_balance_account,
    update_balance,
)

logger = logging.getLogger(__name__)

# PRE-DISPATCH ARGUMENT NORMALISER
# Snaps loosely-formatted Grok arguments onto canonical shapes before the
# tool function runs. Catches the common failure modes where Grok picks the
# right tool but passes slightly-off args (non-ISO dates, loose category
# names, negative amounts, alias frequencies, out-of-taxonomy moods).
# Safe to run on every tool call — unknown keys are passed through untouched.
# ─────────────────────────────────────────────────────────────────────────────

_CANONICAL_CATEGORIES = [
    "Food & Dining", "Groceries", "Transport", "Subscriptions",
    "Health & Fitness", "Shopping", "Rent & Housing", "Travel", "Other",
]

_CANONICAL_MOODS = [
    "happy", "grateful", "motivated", "neutral",
    "stressed", "anxious", "reflective",
]

_MOOD_ALIASES = {
    "sad": "reflective", "down": "reflective", "overwhelmed": "stressed",
    "worried": "anxious", "nervous": "anxious", "tense": "stressed",
    "excited": "happy", "joyful": "happy", "thankful": "grateful",
    "proud": "motivated", "inspired": "motivated", "driven": "motivated",
    "flat": "neutral", "meh": "neutral", "okay": "neutral", "ok": "neutral",
}

_CANONICAL_FREQS = {"weekly", "bi-weekly", "monthly", "yearly"}
_FREQ_ALIASES = {
    "biweekly": "bi-weekly", "bi weekly": "bi-weekly", "fortnightly": "bi-weekly",
    "annual": "yearly", "annually": "yearly", "per year": "yearly", "year": "yearly",
    "per month": "monthly", "every month": "monthly", "month": "monthly",
    "per week": "weekly", "every week": "weekly", "week": "weekly",
    "once a year": "yearly", "once a week": "weekly",
    "daily": "weekly",  # fallback — no 'daily' enum, closest bucket
}

# Date-only fields (strip any accidental time component).
_DATE_ONLY_FIELDS = {"date", "due_date", "deadline", "target_date", "paid_on"}
# Fields that may legitimately carry a time component.
_DATETIME_FIELDS = {"start", "end"}
_DATE_FIELDS = _DATE_ONLY_FIELDS | _DATETIME_FIELDS
_RANGE_FIELDS = {"date_range"}
_AMOUNT_FIELDS = {"amount", "target_amount", "progress_amount", "current_amount"}
_ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_ISO_DATETIME_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?")


_WEEKDAYS = {
    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
    "friday": 4, "saturday": 5, "sunday": 6,
    "mon": 0, "tue": 1, "tues": 1, "wed": 2, "thu": 3, "thur": 3,
    "thurs": 3, "fri": 4, "sat": 5, "sun": 6,
}


def _natural_date_fallback(s: str, now: datetime) -> datetime | None:
    """Handle phrases dateparser chokes on ('next friday', 'end of year', etc.)."""
    v = s.lower().strip()
    if v in ("end of year", "end of the year", "year end", "eoy"):
        return now.replace(month=12, day=31)
    if v in ("end of month", "end of the month", "eom"):
        next_month = now.replace(day=28) + timedelta(days=4)
        return next_month - timedelta(days=next_month.day)
    if v in ("end of week", "end of the week", "eow"):
        return now + timedelta(days=(6 - now.weekday()))
    m = re.match(r"^(next|this|upcoming)\s+([a-z]+)$", v)
    if m:
        target = _WEEKDAYS.get(m.group(2))
        if target is not None:
            delta = (target - now.weekday()) % 7
            if delta == 0 or m.group(1) == "next":
                delta = delta or 7
            return now + timedelta(days=delta)
    m = re.match(r"^in\s+(\d+)\s+(day|days|week|weeks|month|months)$", v)
    if m:
        n = int(m.group(1))
        unit = m.group(2)
        if unit.startswith("day"):
            return now + timedelta(days=n)
        if unit.startswith("week"):
            return now + timedelta(weeks=n)
        if unit.startswith("month"):
            return now + timedelta(days=30 * n)
    return None


def _to_iso_date(value):
    """Coerce a loose date string to YYYY-MM-DD. Leaves datetimes intact."""
    if value is None or value == "":
        return value
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d")
    s = str(value).strip()
    if _ISO_DATE_RE.match(s) or _ISO_DATETIME_RE.match(s):
        return s
    now = datetime.now()
    if _dateparser is not None:
        parsed = _dateparser.parse(
            s,
            settings={"PREFER_DATES_FROM": "future", "RELATIVE_BASE": now},
        )
        if parsed:
            if parsed.hour or parsed.minute:
                return parsed.strftime("%Y-%m-%dT%H:%M:%S")
            return parsed.strftime("%Y-%m-%d")
    # Custom fallback for phrases dateparser can't handle.
    fallback = _natural_date_fallback(s, now)
    if fallback is not None:
        return fallback.strftime("%Y-%m-%d")
    return value  # let tool-level validation handle truly malformed input


def _normalize_category(value):
    if not value:
        return "Other"
    s = str(value).strip()
    # Exact-match short-circuit (case-insensitive).
    for canon in _CANONICAL_CATEGORIES:
        if s.lower() == canon.lower():
            return canon
    match = get_close_matches(s, _CANONICAL_CATEGORIES, n=1, cutoff=0.6)
    return match[0] if match else "Other"


def _normalize_mood(value):
    if not value:
        return "neutral"
    v = str(value).lower().strip()
    if v in _CANONICAL_MOODS:
        return v
    if v in _MOOD_ALIASES:
        return _MOOD_ALIASES[v]
    match = get_close_matches(v, _CANONICAL_MOODS, n=1, cutoff=0.6)
    return match[0] if match else "neutral"


def _normalize_frequency(value):
    if not value:
        return value
    v = str(value).lower().strip()
    if v in _CANONICAL_FREQS:
        return v
    return _FREQ_ALIASES.get(v, v)


def _normalize_amount(value):
    if value is None or value == "":
        return value
    try:
        n = float(value)
        return abs(round(n, 2))
    except (TypeError, ValueError):
        return value


def normalize_args(tool_name: str, args: dict) -> dict:
    """Return a copy of args with canonical shapes applied.

    Dates   -> ISO YYYY-MM-DD (or YYYY-MM-DDTHH:MM:SS if time present)
    Ranges  -> {"from": <iso>, "to": <iso>}
    Amounts -> positive float, 2 decimals
    category / mood / frequency -> snapped to the canonical taxonomy
    Unknown keys pass through untouched.
    """
    if not isinstance(args, dict):
        return args
    out: dict = {}
    for k, v in args.items():
        if k in _DATE_ONLY_FIELDS:
            coerced = _to_iso_date(v)
            if isinstance(coerced, str) and "T" in coerced:
                coerced = coerced.split("T", 1)[0]
            out[k] = coerced
        elif k in _DATETIME_FIELDS:
            out[k] = _to_iso_date(v)
        elif k in _RANGE_FIELDS and isinstance(v, dict):
            fr = _to_iso_date(v.get("from"))
            to = _to_iso_date(v.get("to"))
            if isinstance(fr, str) and "T" in fr:
                fr = fr.split("T", 1)[0]
            if isinstance(to, str) and "T" in to:
                to = to.split("T", 1)[0]
            out[k] = {"from": fr, "to": to}
        elif k in _AMOUNT_FIELDS:
            out[k] = _normalize_amount(v)
        elif k == "category":
            out[k] = _normalize_category(v)
        elif k == "mood":
            out[k] = _normalize_mood(v)
        elif k == "frequency":
            out[k] = _normalize_frequency(v)
        else:
            out[k] = v
    return out


