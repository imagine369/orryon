"""
db.briefings — Morning briefing persistence.
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone

from db.connection import _USE_PG, get_connection

logger = logging.getLogger(__name__)


def get_briefing(user_id: str, date: str) -> dict | None:
    try:
        conn = get_connection()
        row = conn.execute(
            "SELECT * FROM briefings WHERE user_id=? AND date=?", (user_id, date)
        ).fetchone()
        conn.close()
        return dict(row) if row else None
    except Exception as exc:
        logger.error("get_briefing error: %s", exc)
        return None


def save_briefing(user_id: str, date: str, content: dict) -> bool:
    now = datetime.now(timezone.utc).isoformat()
    try:
        conn = get_connection()
        if _USE_PG:
            conn.execute(
                "INSERT INTO briefings (id, user_id, date, content_json, delivered_at) "
                "VALUES (%s, %s, %s, %s, %s) ON CONFLICT(user_id, date) DO UPDATE SET "
                "content_json=EXCLUDED.content_json, delivered_at=EXCLUDED.delivered_at",
                (str(uuid.uuid4()), user_id, date, json.dumps(content), now),
            )
        else:
            conn.execute(
                "INSERT INTO briefings (id, user_id, date, content_json, delivered_at) "
                "VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, date) DO UPDATE SET "
                "content_json=excluded.content_json, delivered_at=excluded.delivered_at",
                (str(uuid.uuid4()), user_id, date, json.dumps(content), now),
            )
        conn.commit()
        conn.close()
        return True
    except Exception as exc:
        logger.error("save_briefing error: %s", exc)
        return False


def mark_briefing_read(user_id: str, date: str) -> bool:
    now = datetime.now(timezone.utc).isoformat()
    try:
        conn = get_connection()
        conn.execute(
            "UPDATE briefings SET read_at=? WHERE user_id=? AND date=?",
            (now, user_id, date),
        )
        conn.commit()
        conn.close()
        return True
    except Exception as exc:
        logger.error("mark_briefing_read error: %s", exc)
        return False


# ── Approval requests ─────────────────────────────────────────────────────────
