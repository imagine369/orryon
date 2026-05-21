"""
db.location — Saved places and commute patterns.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from db.connection import get_connection
from db.crud import insert_row

logger = logging.getLogger(__name__)


def add_user_place(user_id: str, label: str, address: str = "",
                   lat: float = 0, lng: float = 0) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    row = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "label": label,
        "address": address,
        "lat": lat,
        "lng": lng,
        "created_at": now,
    }
    insert_row("user_places", row)
    return row


def get_user_places(user_id: str) -> list[dict]:
    try:
        conn = get_connection()
        rows = conn.execute(
            "SELECT * FROM user_places WHERE user_id=? ORDER BY label",
            (user_id,),
        ).fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as exc:
        logger.error("get_user_places error: %s", exc)
        return []


def delete_user_place(user_id: str, place_id: str) -> bool:
    try:
        conn = get_connection()
        conn.execute("DELETE FROM user_places WHERE id=? AND user_id=?", (place_id, user_id))
        conn.commit()
        conn.close()
        return True
    except Exception as exc:
        logger.error("delete_user_place error: %s", exc)
        return False


def upsert_commute_pattern(user_id: str, from_place: str, to_place: str,
                            days: str, depart_time: str) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    try:
        conn = get_connection()
        existing = conn.execute(
            "SELECT id FROM commute_patterns WHERE user_id=?", (user_id,)
        ).fetchone()
        if existing:
            conn.execute(
                "UPDATE commute_patterns SET from_place=?, to_place=?, days=?, depart_time=? WHERE user_id=?",
                (from_place, to_place, days, depart_time, user_id),
            )
            row = {"id": existing["id"], "user_id": user_id, "from_place": from_place,
                   "to_place": to_place, "days": days, "depart_time": depart_time}
        else:
            row_id = str(uuid.uuid4())
            conn.execute(
                "INSERT INTO commute_patterns (id, user_id, from_place, to_place, days, depart_time, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (row_id, user_id, from_place, to_place, days, depart_time, now),
            )
            row = {"id": row_id, "user_id": user_id, "from_place": from_place,
                   "to_place": to_place, "days": days, "depart_time": depart_time}
        conn.commit()
        conn.close()
        return row
    except Exception as exc:
        logger.error("upsert_commute_pattern error: %s", exc)
        return {}


def get_commute_pattern(user_id: str) -> dict | None:
    try:
        conn = get_connection()
        row = conn.execute("SELECT * FROM commute_patterns WHERE user_id=?", (user_id,)).fetchone()
        conn.close()
        return dict(row) if row else None
    except Exception as exc:
        logger.error("get_commute_pattern error: %s", exc)
        return None


# ── Briefings ─────────────────────────────────────────────────────────────────
