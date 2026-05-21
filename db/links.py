"""
db.links — Link pages and inspo directory.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone

from db.connection import get_connection
from db.crud import insert_row

logger = logging.getLogger(__name__)

INSPO_DIR: str = os.getenv("INSPO_DIR", "inspo")
os.makedirs(INSPO_DIR, exist_ok=True)


# ── Link page helpers ─────────────────────────────────────────────────────────

def get_or_create_link_page(user_id: str) -> dict:
    try:
        conn = get_connection()
        row = conn.execute(
            "SELECT * FROM link_pages WHERE user_id = ? LIMIT 1", (user_id,)
        ).fetchone()
        conn.close()
        if row:
            return dict(row)
    except Exception as exc:
        logger.error("get_or_create_link_page lookup: %s", exc)

    token = uuid.uuid4().hex[:16]
    now = datetime.now(timezone.utc).isoformat()
    record = {
        "id": str(uuid.uuid4()), "user_id": user_id, "share_token": token,
        "page_title": "", "bio": "", "is_public": 0, "theme": "dark",
        "created_at": now, "updated_at": now,
    }
    insert_row("link_pages", record)
    return record


def get_link_page_by_token(token: str) -> dict | None:
    try:
        conn = get_connection()
        row = conn.execute(
            "SELECT lp.*, u.display_name, u.email "
            "FROM link_pages lp JOIN users u ON lp.user_id = u.id "
            "WHERE lp.share_token = ? AND lp.is_public = 1 LIMIT 1",
            (token,),
        ).fetchone()
        conn.close()
        return dict(row) if row else None
    except Exception as exc:
        logger.error("get_link_page_by_token: %s", exc)
        return None


# ── User memory helpers ────────────────────────────────────────────────────────
