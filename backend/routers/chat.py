"""
backend/routers/chat.py — AI chat endpoints with SSE streaming + WebSocket.

Supports two transports for real-time chat:
  1. POST /api/chat  — SSE (legacy, universal fallback)
  2. WS   /ws/chat   — WebSocket (lower latency, persistent connection)

Both emit the same event types:
    {"type": "session", "session_id": "..."}           (auto-created session)
    {"type": "token",   "content": "partial text..."}
    {"type": "tool",    "name": "...", "label": "..."}
    {"type": "done",    "message": "...", "actions": [...], ...}
    {"type": "error",   "message": "..."}
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse

from backend.deps import MONTHLY_SPEND_CAP_USD, RATE_LIMIT_CHAT, check_rate_limit, require_active_plan
from backend.auth import get_current_user, decode_token
from backend.schemas import ChatReq
from db import (
    create_chat_session,
    delete_chat_session,
    get_connection,
    get_monthly_spend,
    list_chat_sessions,
    load_chat_history,
    record_token_spend,
    save_chat_message,
    update_chat_session_title,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["chat"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _resolve_session(uid: str, session_id: str) -> tuple[str, bool]:
    """Return (session_id, was_auto_created). Creates a session if needed."""
    if session_id:
        return session_id, False
    session = create_chat_session(uid)
    return session["id"], True


def _get_display_name(uid: str) -> str:
    conn = get_connection()
    row = conn.execute("SELECT display_name FROM users WHERE id=?", (uid,)).fetchone()
    conn.close()
    return row["display_name"] if row else "there"


# ── SSE transport ─────────────────────────────────────────────────────────────

@router.post("/api/chat")
async def chat_stream(body: ChatReq, user: dict = Depends(require_active_plan)):
    """
    Stream an AI response as Server-Sent Events.

    If session_id is empty the backend auto-creates one and emits a
    {"type": "session"} event as the first frame so the frontend can capture it
    without a separate HTTP roundtrip.
    """
    uid = user["user_id"]
    check_rate_limit(uid, RATE_LIMIT_CHAT)
    message = body.message.strip()
    if not message:
        raise HTTPException(400, "Empty message")

    session_id, auto_created = _resolve_session(uid, body.session_id or "")
    display_name = _get_display_name(uid)

    history = load_chat_history(uid, session_id=session_id)
    user_msg = {"role": "user", "content": message, "created_at": datetime.now(timezone.utc).isoformat()}
    save_chat_message(uid, user_msg, session_id=session_id)

    async def event_generator():
        if auto_created:
            yield f"data: {json.dumps({'type': 'session', 'session_id': session_id})}\n\n"

        current_spend = get_monthly_spend(uid)
        if current_spend >= MONTHLY_SPEND_CAP_USD:
            yield f"data: {json.dumps({'type': 'error', 'message': 'You have reached your monthly usage limit. It resets on the 1st of next month.'})}\n\n"
            yield "data: [DONE]\n\n"
            return

        from core.grok_agent import run_orryon_stream

        full_text = ""
        try:
            async for event in run_orryon_stream(
                user_message=message,
                user_id=uid,
                chat_history=history,
                user_name=display_name or "there",
                session_id=session_id,
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
                    save_chat_message(uid, ai_msg, session_id=session_id)
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


# ── WebSocket transport ───────────────────────────────────────────────────────

@router.websocket("/ws/chat")
async def chat_ws(ws: WebSocket):
    """Persistent WebSocket for chat — same events as SSE but lower per-message
    overhead since the connection stays open across turns."""
    token_str = ws.query_params.get("token", "")
    try:
        payload = decode_token(token_str)
        uid = payload["sub"]
    except Exception:
        await ws.close(code=4001, reason="Invalid or missing token")
        return

    await ws.accept()

    try:
        while True:
            raw = await ws.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await ws.send_json({"type": "error", "message": "Invalid JSON"})
                continue

            message = (data.get("message") or "").strip()
            if not message:
                await ws.send_json({"type": "error", "message": "Empty message"})
                continue

            try:
                check_rate_limit(uid, RATE_LIMIT_CHAT)
            except HTTPException as exc:
                await ws.send_json({"type": "error", "message": exc.detail})
                continue

            req_session_id = data.get("session_id") or ""
            session_id, auto_created = _resolve_session(uid, req_session_id)
            display_name = _get_display_name(uid)

            if auto_created:
                await ws.send_json({"type": "session", "session_id": session_id})

            current_spend = get_monthly_spend(uid)
            if current_spend >= MONTHLY_SPEND_CAP_USD:
                await ws.send_json({"type": "error", "message": "Monthly usage limit reached."})
                continue

            history = load_chat_history(uid, session_id=session_id)
            user_msg = {"role": "user", "content": message, "created_at": datetime.now(timezone.utc).isoformat()}
            save_chat_message(uid, user_msg, session_id=session_id)

            from core.grok_agent import run_orryon_stream

            full_text = ""
            try:
                async for event in run_orryon_stream(
                    user_message=message,
                    user_id=uid,
                    chat_history=history,
                    user_name=display_name or "there",
                    session_id=session_id,
                ):
                    if event["type"] == "token":
                        full_text += event["content"]
                    elif event["type"] == "done":
                        final_text = event.get("message", full_text)
                        ai_msg = {
                            "role": "assistant",
                            "content": final_text,
                            "created_at": datetime.now(timezone.utc).isoformat(),
                        }
                        save_chat_message(uid, ai_msg, session_id=session_id)
                        usage = event.get("usage") or {}
                        if usage.get("prompt_tokens") or usage.get("completion_tokens"):
                            record_token_spend(uid, usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0))
                    await ws.send_json(event)
            except Exception as exc:
                logger.error("WS chat error: %s", exc, exc_info=True)
                await ws.send_json({"type": "error", "message": str(exc)})

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.error("WS unexpected error: %s", exc)


# ── Connection warmup ─────────────────────────────────────────────────────────

@router.get("/api/chat/warm")
async def warm_connection(user: dict = Depends(get_current_user)):
    """Prewarm the TCP+TLS connection to xAI so the first chat message is fast."""
    from core.grok_agent import get_http_client
    client = get_http_client()
    try:
        await client.head("https://api.x.ai/v1/models", timeout=5.0)
    except Exception:
        pass
    return {"warm": True}


@router.get("/api/chat/history")
async def chat_history(
    limit: int = Query(100, le=500),
    session_id: str = Query(""),
    user: dict = Depends(get_current_user),
):
    """Return the user's recent chat messages, optionally filtered by session."""
    return load_chat_history(user["user_id"], limit=limit, session_id=session_id)


# ── Chat sessions ─────────────────────────────────────────────────────────────

@router.post("/api/chat/sessions")
async def create_session(user: dict = Depends(get_current_user)):
    """Create a new empty chat session."""
    session = create_chat_session(user["user_id"])
    return session


@router.get("/api/chat/sessions")
async def get_sessions(
    limit: int = Query(50, le=200),
    user: dict = Depends(get_current_user),
):
    """List the user's chat sessions, most recent first."""
    return list_chat_sessions(user["user_id"], limit=limit)


@router.delete("/api/chat/sessions/{session_id}")
async def remove_session(session_id: str, user: dict = Depends(get_current_user)):
    """Delete a chat session and all its messages."""
    ok = delete_chat_session(user["user_id"], session_id)
    if not ok:
        raise HTTPException(404, "Session not found")
    return {"deleted": True}


@router.patch("/api/chat/sessions/{session_id}")
async def rename_session(session_id: str, user: dict = Depends(get_current_user)):
    """Update a chat session title (currently a no-op placeholder)."""
    return {"updated": True}
