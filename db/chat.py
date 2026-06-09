"""
db.chat — Chat messages and sessions.
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone

from db.connection import get_connection
from db.crud import insert_row

logger = logging.getLogger(__name__)

_TOOL_ACTIONS_EVIDENCE_KEY = "tool_actions"


def encode_tool_actions(actions: list | None) -> str:
    """Serialize tool actions into the chat_messages.evidence column."""
    if not actions:
        return ""
    return json.dumps({_TOOL_ACTIONS_EVIDENCE_KEY: actions}, separators=(",", ":"))


def decode_tool_actions(evidence: str | None) -> list:
    """Restore tool actions persisted on an assistant message."""
    if not evidence:
        return []
    try:
        parsed = json.loads(evidence)
    except (TypeError, json.JSONDecodeError):
        return []
    if not isinstance(parsed, dict):
        return []
    actions = parsed.get(_TOOL_ACTIONS_EVIDENCE_KEY)
    return actions if isinstance(actions, list) else []


def save_chat_message(user_id: str, msg: dict, session_id: str = "") -> bool:
    now = datetime.now(timezone.utc).isoformat()
    tool_actions = msg.get("tool_actions")
    if tool_actions is None:
        tool_actions = msg.get("actions")
    evidence = msg.get("evidence", "")
    if tool_actions:
        evidence = encode_tool_actions(tool_actions)
    row = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "session_id": session_id,
        "role": msg.get("role", "user"),
        "content": msg.get("content", ""),
        "agent": msg.get("agent", ""),
        "status": msg.get("status", ""),
        "summary": msg.get("summary", ""),
        "confidence": msg.get("confidence", 0),
        "evidence": evidence,
        "next_steps": msg.get("next_steps_or_question", ""),
        "created_at": now,
    }
    ok = insert_row("chat_messages", row)
    if ok and session_id:
        try:
            conn = get_connection()
            conn.execute("UPDATE chat_sessions SET updated_at=? WHERE id=?", (now, session_id))
            conn.commit()
            conn.close()
        except Exception:
            pass
    return ok


def load_chat_history(user_id: str, limit: int = 100, session_id: str = "") -> list[dict]:
    try:
        conn = get_connection()
        if session_id:
            rows = conn.execute(
                "SELECT * FROM ("
                "  SELECT * FROM chat_messages"
                "  WHERE user_id = ? AND session_id = ?"
                "  ORDER BY created_at DESC LIMIT ?"
                ") sub ORDER BY created_at ASC",
                (user_id, session_id, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM ("
                "  SELECT * FROM chat_messages"
                "  WHERE user_id = ?"
                "  ORDER BY created_at DESC LIMIT ?"
                ") sub ORDER BY created_at ASC",
                (user_id, limit),
            ).fetchall()
        conn.close()
        msgs = []
        for r in rows:
            d = dict(r)
            d["next_steps_or_question"] = d.pop("next_steps", "")
            actions = decode_tool_actions(d.get("evidence"))
            if actions:
                d["actions"] = actions
            msgs.append(d)
        return msgs
    except Exception as exc:
        logger.error("load_chat_history error: %s", exc)
        return []


# ── Chat session helpers ──────────────────────────────────────────────────────

def create_chat_session(user_id: str, title: str = "") -> dict:
    now = datetime.now(timezone.utc).isoformat()
    session_id = str(uuid.uuid4())
    insert_row("chat_sessions", {
        "id": session_id, "user_id": user_id, "title": title,
        "created_at": now, "updated_at": now,
    })
    return {"id": session_id, "title": title, "created_at": now, "updated_at": now}


def list_chat_sessions(user_id: str, limit: int = 50) -> list[dict]:
    try:
        conn = get_connection()
        rows = conn.execute(
            "SELECT * FROM chat_sessions WHERE user_id=? ORDER BY updated_at DESC LIMIT ?",
            (user_id, limit),
        ).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            first_msg = conn.execute(
                "SELECT content FROM chat_messages WHERE session_id=? AND role='user' ORDER BY created_at ASC LIMIT 1",
                (d["id"],),
            ).fetchone()
            d["preview"] = (first_msg["content"][:80] if first_msg else "") if first_msg else ""
            msg_count = conn.execute(
                "SELECT COUNT(*) as cnt FROM chat_messages WHERE session_id=?", (d["id"],)
            ).fetchone()
            d["message_count"] = msg_count["cnt"] if isinstance(msg_count, dict) else msg_count[0]
            result.append(d)
        conn.close()
        return result
    except Exception as exc:
        logger.error("list_chat_sessions error: %s", exc)
        return []


def delete_chat_session(user_id: str, session_id: str) -> bool:
    try:
        conn = get_connection()
        conn.execute("DELETE FROM chat_messages WHERE session_id=? AND user_id=?", (session_id, user_id))
        conn.execute("DELETE FROM chat_sessions WHERE id=? AND user_id=?", (session_id, user_id))
        conn.commit()
        conn.close()
        return True
    except Exception as exc:
        logger.error("delete_chat_session error: %s", exc)
        return False


def get_session_summary_meta(session_id: str) -> dict:
    """Return cached session summary and how many turns it covers."""
    if not session_id:
        return {"summary": "", "summary_message_count": 0}
    try:
        conn = get_connection()
        row = conn.execute(
            "SELECT summary, summary_message_count FROM chat_sessions WHERE id=?",
            (session_id,),
        ).fetchone()
        conn.close()
        if not row:
            return {"summary": "", "summary_message_count": 0}
        d = dict(row)
        return {
            "summary": d.get("summary") or "",
            "summary_message_count": int(d.get("summary_message_count") or 0),
        }
    except Exception as exc:
        logger.error("get_session_summary_meta error: %s", exc)
        return {"summary": "", "summary_message_count": 0}


def update_session_summary(
    session_id: str,
    summary: str,
    message_count: int,
) -> bool:
    if not session_id:
        return False
    try:
        now = datetime.now(timezone.utc).isoformat()
        conn = get_connection()
        conn.execute(
            "UPDATE chat_sessions SET summary=?, summary_message_count=?, updated_at=? WHERE id=?",
            (summary, message_count, now, session_id),
        )
        conn.commit()
        conn.close()
        return True
    except Exception as exc:
        logger.error("update_session_summary error: %s", exc)
        return False


def update_chat_session_title(user_id: str, session_id: str, title: str) -> bool:
    try:
        conn = get_connection()
        conn.execute(
            "UPDATE chat_sessions SET title=? WHERE id=? AND user_id=?",
            (title, session_id, user_id),
        )
        conn.commit()
        conn.close()
        return True
    except Exception as exc:
        logger.error("update_chat_session_title error: %s", exc)
        return False


# ── Ensure directories exist ──────────────────────────────────────────────────
