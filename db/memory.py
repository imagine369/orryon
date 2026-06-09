"""
db.memory — User memory facts (conversation + API).
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from core.memory_constants import MEMORY_CAP
from core.memory_dedup import find_similar_fact
from db.connection import get_connection
from db.crud import insert_row, update_row

logger = logging.getLogger(__name__)


def save_user_memory(
    user_id: str,
    fact: str,
    category: str = "general",
    *,
    confidence: float = 1.0,
) -> bool:
    """Save a fact with fuzzy dedup and cap pruning."""
    fact = fact.strip()
    if len(fact) <= 5:
        return False

    existing = get_user_memories(user_id, limit=MEMORY_CAP)
    match = find_similar_fact(fact, existing)
    if match:
        old_fact = match.get("fact") or ""
        if len(fact) > len(old_fact):
            now = datetime.now(timezone.utc).isoformat()
            old_conf = float(match.get("confidence") or 1.0)
            update_row(
                "user_memory",
                {
                    "fact": fact,
                    "created_at": now,
                    "confidence": max(confidence, old_conf),
                },
                {"id": match["id"], "user_id": user_id},
            )
        return False

    if count_user_memory(user_id) >= MEMORY_CAP:
        prune_user_memory(user_id, keep=MEMORY_CAP - 1)

    ok = insert_row("user_memory", {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "fact": fact,
        "category": category,
        "source": "conversation",
        "confidence": confidence,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    if ok:
        prune_user_memory(user_id, keep=MEMORY_CAP)
    return ok


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
        row = conn.execute(
            "SELECT COUNT(*) as c FROM user_memory WHERE user_id=?",
            (user_id,),
        ).fetchone()
        conn.close()
        return int(row["c"]) if row else 0
    except Exception as exc:
        logger.error("count_user_memory error: %s", exc)
        return 0


def prune_user_memory(user_id: str, *, keep: int = MEMORY_CAP) -> int:
    """Drop lowest-confidence, then oldest facts until count <= keep. Returns rows removed."""
    try:
        count = count_user_memory(user_id)
        excess = count - keep
        if excess <= 0:
            return 0
        conn = get_connection()
        rows = conn.execute(
            "SELECT id FROM user_memory WHERE user_id=? "
            "ORDER BY confidence ASC, created_at ASC LIMIT ?",
            (user_id, excess),
        ).fetchall()
        ids = [r["id"] if isinstance(r, dict) else r[0] for r in rows]
        for mid in ids:
            conn.execute("DELETE FROM user_memory WHERE id=? AND user_id=?", (mid, user_id))
        conn.commit()
        conn.close()
        return len(ids)
    except Exception as exc:
        logger.error("prune_user_memory error: %s", exc)
        return 0
