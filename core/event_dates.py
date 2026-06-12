"""Parse and format stored calendar event_date values."""

from __future__ import annotations

import re

_TIME_RE = re.compile(r"^\d{2}:\d{2}$")


def split_event_date(event_date: str | None) -> tuple[str, str]:
    """Return (YYYY-MM-DD, HH:MM) from stored event_date (space- or T-separated)."""
    if not event_date:
        return "", ""
    normalized = str(event_date).strip().replace("T", " ")
    date_str = normalized[:10]
    time_part = normalized[11:16] if len(normalized) > 10 else ""
    time_str = time_part if _TIME_RE.match(time_part) else ""
    return date_str, time_str


def format_event_date(date_str: str, time_str: str | None = None) -> str:
    """Build canonical stored event_date: YYYY-MM-DD or YYYY-MM-DD HH:MM."""
    d = (date_str or "")[:10]
    t = (time_str or "").strip()
    if t and _TIME_RE.match(t[:5]):
        return f"{d} {t[:5]}"
    return d
