"""Per-user Google Calendar OAuth token storage."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from db import get_connection


def store_google_tokens(uid: str, tokens: dict) -> None:
    now = datetime.now(timezone.utc).isoformat()
    payload = json.dumps(tokens)
    with get_connection() as conn:
        existing = conn.execute(
            "SELECT id FROM user_calendar_tokens WHERE user_id=?", (uid,)
        ).fetchone()
        if existing:
            conn.execute(
                "UPDATE user_calendar_tokens SET tokens=?, updated_at=? WHERE user_id=?",
                (payload, now, uid),
            )
        else:
            conn.execute(
                "INSERT INTO user_calendar_tokens (id, user_id, tokens, created_at, updated_at) "
                "VALUES (?,?,?,?,?)",
                (str(uuid.uuid4()), uid, payload, now, now),
            )
        conn.commit()


def get_google_tokens(uid: str) -> dict | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT tokens FROM user_calendar_tokens WHERE user_id=?", (uid,)
        ).fetchone()
    if not row:
        return None
    return json.loads(row["tokens"])
