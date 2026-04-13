"""
backend/routers/chat.py — AI chat endpoints with SSE streaming.

The POST /api/chat endpoint is the primary interface between the Next.js
frontend and the Grok AI agent. It streams Server-Sent Events (SSE) with
the following event format, which frontend/src/lib/api.ts parses:

    data: {"type": "token",  "content": "partial text..."}
    data: {"type": "tool",   "name": "add_expense", "label": "Logging expense"}
    data: {"type": "done",   "message": "...", "actions": [...], "tabs": [...], "undo_info": ...}
    data: {"type": "error",  "message": "..."}
    data: [DONE]

The frontend's `streamChat()` async generator reads these lines, splits on
newlines, and JSON-parses anything after "data: ".
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from backend.deps import MONTHLY_SPEND_CAP_USD, RATE_LIMIT_CHAT, check_rate_limit, require_active_plan
from backend.auth import get_current_user
from backend.schemas import ChatReq
from db import get_connection, get_monthly_spend, load_chat_history, record_token_spend, save_chat_message

logger = logging.getLogger(__name__)

router = APIRouter(tags=["chat"])


@router.post("/api/chat")
async def chat_stream(body: ChatReq, user: dict = Depends(require_active_plan)):
    """
    Stream an AI response as Server-Sent Events.

    Enforces per-user rate limits and monthly spend caps before calling the
    Grok agent. Each SSE line is prefixed with "data: " and contains a JSON
    object matching the ChatEvent interface in the frontend.
    """
    uid = user["user_id"]
    check_rate_limit(uid, RATE_LIMIT_CHAT)
    message = body.message.strip()
    if not message:
        raise HTTPException(400, "Empty message")

    conn = get_connection()
    user_row = conn.execute("SELECT display_name FROM users WHERE id=?", (uid,)).fetchone()
    conn.close()
    display_name = user_row["display_name"] if user_row else "there"

    history = load_chat_history(uid)
    user_msg = {"role": "user", "content": message, "created_at": datetime.now(timezone.utc).isoformat()}
    save_chat_message(uid, user_msg)

    async def event_generator():
        current_spend = get_monthly_spend(uid)
        if current_spend >= MONTHLY_SPEND_CAP_USD:
            yield f"data: {json.dumps({'type': 'error', 'message': 'You have reached your monthly usage limit. It resets on the 1st of next month.'})}\n\n"
            yield "data: [DONE]\n\n"
            return

        from core.grok_agent import run_orryon_stream

        full_text = ""
        try:
            for event in run_orryon_stream(
                user_message=message,
                user_id=uid,
                chat_history=history,
                user_name=display_name or "there",
            ):
                if event["type"] == "token":
                    full_text += event["content"]
                    yield f"data: {json.dumps(event)}\n\n"
                elif event["type"] == "tool":
                    yield f"data: {json.dumps(event)}\n\n"
                elif event["type"] == "done":
                    final_text = event.get("message", full_text)
                    ai_msg = {
                        "role": "assistant",
                        "content": final_text,
                        "created_at": datetime.now(timezone.utc).isoformat(),
                    }
                    save_chat_message(uid, ai_msg)
                    usage = event.get("usage") or {}
                    if usage.get("prompt_tokens") or usage.get("completion_tokens"):
                        record_token_spend(
                            uid,
                            usage.get("prompt_tokens", 0),
                            usage.get("completion_tokens", 0),
                        )
                    yield f"data: {json.dumps(event)}\n\n"
                elif event["type"] == "error":
                    yield f"data: {json.dumps(event)}\n\n"
        except Exception as exc:
            logger.error("Chat stream error: %s", exc, exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/api/chat/history")
async def chat_history(limit: int = Query(100, le=500), user: dict = Depends(get_current_user)):
    """Return the user's recent chat messages."""
    return load_chat_history(user["user_id"], limit=limit)
