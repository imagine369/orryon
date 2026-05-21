"""
db.preferences — User preference rows.
"""
from __future__ import annotations

import logging

from db.connection import get_connection

logger = logging.getLogger(__name__)


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
        }
    except Exception as exc:
        logger.error("get_user_preferences error: %s", exc)
        return {"user_id": user_id}


def upsert_user_preferences(user_id: str, updates: dict) -> bool:
    try:
        conn = get_connection()
        existing = conn.execute("SELECT user_id FROM user_preferences WHERE user_id=?", (user_id,)).fetchone()
        if existing:
            sets = ", ".join(f"{k}=?" for k in updates)
            conn.execute(f"UPDATE user_preferences SET {sets} WHERE user_id=?", (*updates.values(), user_id))
        else:
            row = {"user_id": user_id, **updates}
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
