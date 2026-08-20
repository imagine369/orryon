"""Per-user xAI (Grok) API keys — stored encrypted, never returned in full."""
from __future__ import annotations

import logging

from config import XAI_API_KEY, XAI_API_KEYS
from db.connection import decrypt_value, encrypt_value, get_connection

logger = logging.getLogger(__name__)

_MIN_KEY_LEN = 12


def validate_xai_key(raw: str) -> str:
    key = (raw or "").strip()
    if not key:
        raise ValueError("API key is empty")
    if len(key) < _MIN_KEY_LEN:
        raise ValueError("API key looks too short")
    if " " in key or "\n" in key:
        raise ValueError("API key must be a single token")
    return key


def mask_xai_key(key: str) -> str:
    if not key:
        return ""
    tail = key[-4:] if len(key) >= 4 else key
    return f"xai-…{tail}"


def get_user_xai_key(user_id: str) -> str:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT xai_api_key_enc FROM users WHERE id=?", (user_id,)
        ).fetchone()
    if not row:
        return ""
    stored = (dict(row).get("xai_api_key_enc") or "").strip()
    if not stored:
        return ""
    return decrypt_value(stored).strip()


def set_user_xai_key(user_id: str, raw: str | None) -> None:
    if not raw:
        with get_connection() as conn:
            conn.execute("UPDATE users SET xai_api_key_enc='' WHERE id=?", (user_id,))
            conn.commit()
        return
    key = validate_xai_key(raw)
    sealed = encrypt_value(key)
    with get_connection() as conn:
        conn.execute(
            "UPDATE users SET xai_api_key_enc=? WHERE id=?", (sealed, user_id)
        )
        conn.commit()


def server_xai_keys() -> list[str]:
    keys = [k for k in XAI_API_KEYS if k] if XAI_API_KEYS else []
    if XAI_API_KEY:
        keys = [XAI_API_KEY] + [k for k in keys if k != XAI_API_KEY]
    return keys


def resolve_api_key(user_id: str) -> str:
    """Prefer the user's Grok key; fall back to server .env for self-host."""
    user_key = get_user_xai_key(user_id)
    if user_key:
        return user_key
    keys = server_xai_keys()
    return keys[0] if keys else ""


def has_chat_api_key(user_id: str) -> bool:
    return bool(resolve_api_key(user_id))
