"""Cache partner URLs per user to avoid repeat web_search / link regeneration."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from db.connection import _USE_PG, get_connection

logger = logging.getLogger(__name__)


def get_cached_url(user_id: str, cache_key: str) -> str | None:
    try:
        with get_connection() as conn:
            row = conn.execute(
                "SELECT url FROM fulfillment_url_cache WHERE user_id=? AND cache_key=?",
                (user_id, cache_key),
            ).fetchone()
        return row["url"] if row else None
    except Exception as exc:
        logger.error("get_cached_url error: %s", exc)
        return None


def set_cached_url(user_id: str, cache_key: str, url: str) -> None:
    """Upsert a cached partner URL for (user_id, cache_key)."""
    cache_key = cache_key[:200]
    url = url[:2000]
    now = datetime.now(timezone.utc).isoformat()
    row_id = str(uuid.uuid4())
    try:
        with get_connection() as conn:
            if _USE_PG:
                conn.execute(
                    "INSERT INTO fulfillment_url_cache (id, user_id, cache_key, url, created_at) "
                    "VALUES (%s, %s, %s, %s, %s) ON CONFLICT(user_id, cache_key) DO UPDATE SET "
                    "url=EXCLUDED.url, created_at=EXCLUDED.created_at",
                    (row_id, user_id, cache_key, url, now),
                )
            else:
                conn.execute(
                    "INSERT INTO fulfillment_url_cache (id, user_id, cache_key, url, created_at) "
                    "VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, cache_key) DO UPDATE SET "
                    "url=excluded.url, created_at=excluded.created_at",
                    (row_id, user_id, cache_key, url, now),
                )
            conn.commit()
    except Exception as exc:
        logger.error("set_cached_url error: %s", exc)
