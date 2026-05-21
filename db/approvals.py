"""
db.approvals — Tool approval requests.
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timedelta, timezone

from db.connection import get_connection
from db.crud import insert_row

logger = logging.getLogger(__name__)


def create_approval_request(
    user_id: str,
    action_type: str,
    description: str,
    payload: dict,
    expires_hours: int = 48,
    status: str = "pending",
) -> dict:
    now = datetime.now(timezone.utc)
    expires = (now + timedelta(hours=expires_hours)).isoformat()
    row = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "action_type": action_type,
        "description": description,
        "payload_json": json.dumps(payload),
        "status": status if status in ("pending", "approved", "rejected") else "pending",
        "created_at": now.isoformat(),
        "expires_at": expires,
        "resolved_at": now.isoformat() if status in ("approved", "rejected") else "",
    }
    insert_row("approval_requests", row)
    return row


def get_approval_requests(user_id: str, status: str | None = "pending") -> list[dict]:
    try:
        conn = get_connection()
        if status:
            rows = conn.execute(
                "SELECT * FROM approval_requests WHERE user_id=? AND status=? ORDER BY created_at DESC",
                (user_id, status),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM approval_requests WHERE user_id=? ORDER BY created_at DESC LIMIT 50",
                (user_id,),
            ).fetchall()
        conn.close()
        result = []
        for r in rows:
            d = dict(r)
            try:
                d["payload"] = json.loads(d.get("payload_json") or "{}")
            except Exception:
                d["payload"] = {}
            result.append(d)
        return result
    except Exception as exc:
        logger.error("get_approval_requests error: %s", exc)
        return []


def resolve_approval_request(user_id: str, approval_id: str, status: str) -> bool:
    if status not in ("approved", "rejected"):
        return False
    now = datetime.now(timezone.utc).isoformat()
    try:
        conn = get_connection()
        conn.execute(
            "UPDATE approval_requests SET status=?, resolved_at=? WHERE id=? AND user_id=? AND status='pending'",
            (status, now, approval_id, user_id),
        )
        conn.commit()
        conn.close()
        return True
    except Exception as exc:
        logger.error("resolve_approval_request error: %s", exc)
        return False


# ── Memory helpers (extended) ─────────────────────────────────────────────────
