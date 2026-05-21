"""
db.memory — User memory facts (conversation + API).
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from db.connection import get_connection
from db.crud import insert_row

logger = logging.getLogger(__name__)


def save_user_memory(user_id: str, fact: str, category: str = "general") -> bool:
    return insert_row("user_memory", {
        "id": str(uuid.uuid4()), "user_id": user_id, "fact": fact.strip(),
        "category": category, "source": "conversation",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


def get_user_memories(user_id: str, limit: int = 50) -> list[dict]:
    try:
        conn = get_connection()
        rows = conn.execute(
            "SELECT * FROM user_memory WHERE user_id=? ORDER BY created_at DESC LIMIT ?",
            (user_id, limit),
        ).fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as exc:
        logger.error("get_user_memories error: %s", exc)
        return []


# ── Balance account helpers ────────────────────────────────────────────────

def get_user_memory(user_id: str, category: str | None = None, limit: int = 100) -> list[dict]:
    try:
        conn = get_connection()
        if category:
            rows = conn.execute(
                "SELECT * FROM user_memory WHERE user_id=? AND category=? ORDER BY created_at DESC LIMIT ?",
                (user_id, category, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM user_memory WHERE user_id=? ORDER BY created_at DESC LIMIT ?",
                (user_id, limit),
            ).fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as exc:
        logger.error("get_user_memory error: %s", exc)
        return []


def delete_memory_fact(user_id: str, memory_id: str) -> bool:
    try:
        conn = get_connection()
        conn.execute("DELETE FROM user_memory WHERE id=? AND user_id=?", (memory_id, user_id))
        conn.commit()
        conn.close()
        return True
    except Exception as exc:
        logger.error("delete_memory_fact error: %s", exc)
        return False


def count_user_memory(user_id: str) -> int:
    try:
        conn = get_connection()
        row = conn.execute("SELECT COUNT(*) as c FROM user_memory WHERE user_id=?", (user_id,)).fetchone()
        conn.close()
        return int(row["c"]) if row else 0
    except Exception as exc:
        logger.error("count_user_memory error: %s", exc)
        return 0


# ── Auto-initialise (SQLite only — Postgres init is done in FastAPI lifespan) ─
