"""Gmail read-only API routes."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.auth import get_current_user
from config import GOOGLE_GMAIL_ENABLED
from core.integrations.google_tokens import get_google_tokens
from db import get_connection

router = APIRouter(tags=["gmail"])
logger = logging.getLogger(__name__)

_IN_SCHEMA = GOOGLE_GMAIL_ENABLED


def _require_gmail() -> None:
    if not GOOGLE_GMAIL_ENABLED:
        raise HTTPException(status_code=404, detail="Not found")


@router.get("/api/gmail/status", include_in_schema=_IN_SCHEMA)
async def gmail_status(user: dict = Depends(get_current_user)):
    """Return Gmail connection state for the current user."""
    uid = user["user_id"]
    tokens = get_google_tokens(uid)
    has_gmail = False
    if tokens:
        granted = tokens.get("scopes", [])
        has_gmail = any("gmail" in s for s in granted)
    return {
        "gmail_available": GOOGLE_GMAIL_ENABLED,
        "connected": GOOGLE_GMAIL_ENABLED and has_gmail,
    }


@router.get("/api/gmail/messages", include_in_schema=_IN_SCHEMA)
async def gmail_messages(
    max_results: int = Query(default=20, ge=1, le=100),
    user: dict = Depends(get_current_user),
):
    """Fetch recent Gmail inbox messages (metadata only — no body content)."""
    _require_gmail()
    uid = user["user_id"]
    try:
        from core.integrations.gmail import fetch_gmail_messages
        messages = fetch_gmail_messages(uid, max_results=max_results)
    except Exception as exc:
        logger.error("Gmail fetch failed for user %s: %s", uid, exc)
        raise HTTPException(status_code=500, detail=f"Gmail fetch failed: {exc}")
    if messages is None:
        raise HTTPException(status_code=400, detail="Gmail not connected.")
    return {"messages": messages, "count": len(messages)}


@router.delete("/api/gmail/disconnect", include_in_schema=_IN_SCHEMA)
async def gmail_disconnect(user: dict = Depends(get_current_user)):
    """
    Disconnect Gmail by removing the stored OAuth tokens.

    Because Calendar and Gmail share one OAuth grant, this also
    removes Calendar access. The user can reconnect both at once.
    """
    _require_gmail()
    uid = user["user_id"]
    with get_connection() as conn:
        conn.execute("DELETE FROM user_calendar_tokens WHERE user_id=?", (uid,))
        conn.commit()
    return {"disconnected": True}
