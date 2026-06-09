"""
db.preferences — User preference rows.
"""
from __future__ import annotations

import logging

from db.connection import get_connection

logger = logging.getLogger(__name__)

LIFE_PRIORITY_IDS = frozenset({
    "health", "calendar", "communication", "finance", "tasks", "notes",
})

# Columns upsert_user_preferences may write (excludes user_id PK).
_ALLOWED_PREFERENCE_COLUMNS = frozenset({
    "last_reset_anchor",
    "voice_overlay_enabled",
    "golden_mode_enabled",
    "briefing_time",
    "briefing_includes",
    "onboarding_complete",
    "life_priorities",
    "life_priorities_set",
})


def parse_life_priorities(raw: str) -> list[str]:
    out: list[str] = []
    for part in (raw or "").split(","):
        pid = part.strip()
        if pid in LIFE_PRIORITY_IDS and pid not in out:
            out.append(pid)
        if len(out) >= 3:
            break
    return out


def normalize_life_priorities(raw: str | None) -> str:
    return ",".join(parse_life_priorities(raw or ""))


def get_user_preferences(user_id: str) -> dict:
    try:
        conn = get_connection()
        row = conn.execute("SELECT * FROM user_preferences WHERE user_id=?", (user_id,)).fetchone()
        conn.close()
        if row:
            return dict(row)
        return {
            "user_id": user_id,
            "last_reset_anchor": None,
            "voice_overlay_enabled": 0,
            "golden_mode_enabled": 0,
            "briefing_time": "07:00",
            "briefing_includes": "finance,health,calendar,goals",
            "onboarding_complete": 0,
            "life_priorities": "",
            "life_priorities_set": 0,
        }
    except Exception as exc:
        logger.error("get_user_preferences error: %s", exc)
        return {"user_id": user_id}


def upsert_user_preferences(user_id: str, updates: dict) -> bool:
    filtered = {k: v for k, v in updates.items() if k in _ALLOWED_PREFERENCE_COLUMNS}
    if not filtered:
        return False
    try:
        conn = get_connection()
        existing = conn.execute("SELECT user_id FROM user_preferences WHERE user_id=?", (user_id,)).fetchone()
        if existing:
            sets = ", ".join(f"{k}=?" for k in filtered)
            conn.execute(f"UPDATE user_preferences SET {sets} WHERE user_id=?", (*filtered.values(), user_id))
        else:
            row = {"user_id": user_id, **filtered}
            cols = ", ".join(row.keys())
            placeholders = ", ".join("?" for _ in row)
            conn.execute(f"INSERT INTO user_preferences ({cols}) VALUES ({placeholders})", tuple(row.values()))
        conn.commit()
        conn.close()
        return True
    except Exception as exc:
        logger.error("upsert_user_preferences error: %s", exc)
        return False


# ── Chat message quota ────────────────────────────────────────────────────────
