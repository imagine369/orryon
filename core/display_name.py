"""Display name formatting for user-facing copy."""

from __future__ import annotations


def normalize_display_name(name: str | None) -> str:
    """Trim and capitalize the first letter (e.g. sato → Sato)."""
    if not name:
        return ""
    trimmed = name.strip()
    if not trimmed:
        return ""
    return trimmed[0].upper() + trimmed[1:]
