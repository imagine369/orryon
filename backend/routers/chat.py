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
from pydantic import BaseModel

from backend.deps import (
    check_monthly_api_quota,
    check_rate_limit,
    check_chat_quota,
    get_rate_limit_chat,
    require_active_plan,
    resolve_plan_for_user,
)
from backend.auth import consume_ws_ticket, create_ws_ticket, decode_token, get_current_user
from backend.signing import require_signed_request
from backend.schemas import ChatReq
from db.preferences import parse_life_priorities
from db import (
    create_chat_session,
    delete_chat_session,
    get_chat_message_count,
    get_connection,
    get_user_preferences,
    increment_chat_message_count,
    list_chat_sessions,
    load_chat_history,
    record_token_spend,
    save_chat_message,
    update_chat_session_title,
)
from core.agent_shared import USER_FACING_CHAT_ERROR
from core.display_name import normalize_display_name

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
    with get_connection() as conn:
        row = conn.execute("SELECT display_name FROM users WHERE id=?", (uid,)).fetchone()
    raw = row["display_name"] if row else None
    return normalize_display_name(raw) or "there"


def _get_user_context(uid: str) -> dict:
    """Return user plan, segment, display_name, and preferences in one pass."""
    conn = get_connection()
    user_row = conn.execute("SELECT plan, segment, display_name FROM users WHERE id=?", (uid,)).fetchone()
    conn.close()
    prefs = get_user_preferences(uid)
    life_priorities = parse_life_priorities(prefs.get("life_priorities", ""))
    if not user_row:
        return {
            "plan": "free",
            "segment": "",
            "display_name": "there",
            "voice_overlay": False,
            "golden_mode": False,
            "life_priorities": life_priorities,
        }
    return {
        "plan": user_row["plan"] or "free",
        "segment": user_row["segment"] or "",
        "display_name": normalize_display_name(user_row["display_name"]) or "there",
        "voice_overlay": bool(prefs.get("voice_overlay_enabled", 0)),
        "golden_mode": bool(prefs.get("golden_mode_enabled", 0)),
        "life_priorities": life_priorities,
    }


# ── SSE transport ─────────────────────────────────────────────────────────────

@router.post("/api/chat")
async def chat_stream(
    body: ChatReq,
    user: dict = Depends(require_active_plan),
    _signed: dict = Depends(require_signed_request),
):
    """
    Stream an AI response as Server-Sent Events.

    If session_id is empty the backend auto-creates one and emits a
    {"type": "session"} event as the first frame so the frontend can capture it
    without a separate HTTP roundtrip.
    """
    uid = user["user_id"]
    ctx = _get_user_context(uid)
    check_rate_limit(uid, get_rate_limit_chat(ctx["plan"]))
    message = body.message.strip()
    if not message:
        raise HTTPException(400, "Empty message")

    check_chat_quota(uid, ctx["plan"])
    check_monthly_api_quota(uid, ctx["plan"])

    session_id, auto_created = _resolve_session(uid, body.session_id or "")

    history = load_chat_history(uid, session_id=session_id)
    user_msg = {"role": "user", "content": message, "created_at": datetime.now(timezone.utc).isoformat()}
    save_chat_message(uid, user_msg, session_id=session_id)
    increment_chat_message_count(uid)

    async def event_generator():
        if auto_created:
            yield f"data: {json.dumps({'type': 'session', 'session_id': session_id})}\n\n"

        from core.grok_agent import run_orryon_stream

        full_text = ""
        try:
            async for event in run_orryon_stream(
                user_message=message,
                user_id=uid,
                chat_history=history,
                user_name=ctx["display_name"],
                session_id=session_id,
                tier=ctx["plan"],
                mode="golden" if ctx["golden_mode"] else "adult",
                life_priorities=ctx.get("life_priorities") or [],
            ):
                if event["type"] == "token":
                    full_text += event["content"]
                    yield f"data: {json.dumps(event)}\n\n"
                elif event["type"] in ("tool", "retry", "confirm_required"):
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
                    # TTS only for Premium Plus with speak-responses preference on
                    event["voice_overlay"] = (
                        ctx["plan"] == "premium_plus" and ctx["voice_overlay"]
                    )
                    yield f"data: {json.dumps(event)}\n\n"
                elif event["type"] == "error":
                    yield f"data: {json.dumps(event)}\n\n"
        except Exception:
            logger.exception("Chat stream error")
            yield f"data: {json.dumps({'type': 'error', 'message': USER_FACING_CHAT_ERROR})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# ── WebSocket transport ───────────────────────────────────────────────────────

@router.websocket("/ws/chat")
async def chat_ws(ws: WebSocket):
    """Persistent WebSocket for chat — same events as SSE but lower per-message
    overhead since the connection stays open across turns.

    Prefers a short-lived ticket (?ticket=...) fetched from /api/chat/ws-ticket.
    Falls back to ?token=<JWT> for legacy clients (Capacitor mobile, older tabs)
    until they all migrate.
    """
    uid: str | None = None

    ticket_str = ws.query_params.get("ticket", "")
    if ticket_str:
        payload = consume_ws_ticket(ticket_str)
        if payload:
            uid = payload["user_id"]

    if uid is None:
        token_str = ws.query_params.get("token", "")
        if token_str:
            try:
                payload = decode_token(token_str)
                uid = payload["sub"]
            except Exception:
                uid = None

    if uid is None:
        await ws.close(code=4001, reason="Invalid or missing ticket")
        return

    await ws.accept()

    # Enforce subscription gate — same policy as the SSE /api/chat endpoint
    try:
        plan_info = resolve_plan_for_user(uid)
    except HTTPException:
        plan_info = {"is_active_pro": False}

    if not plan_info["is_active_pro"]:
        await ws.send_json({
            "type": "error",
            "message": "Your Pro trial has ended. Upgrade to continue using Orryon.",
        })
        await ws.close(code=4003)
        return

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

            ctx = _get_user_context(uid)
            try:
                check_rate_limit(uid, get_rate_limit_chat(ctx["plan"]))
            except HTTPException as exc:
                await ws.send_json({"type": "error", "message": exc.detail})
                continue

            try:
                check_chat_quota(uid, ctx["plan"])
            except HTTPException as exc:
                detail = exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail)}
                await ws.send_json({
                    "type": "error",
                    "message": detail.get("message", "Chat limit reached."),
                    "limit": detail,
                })
                continue

            try:
                check_monthly_api_quota(uid, ctx["plan"])
            except HTTPException as exc:
                detail = exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail)}
                await ws.send_json({
                    "type": "error",
                    "message": detail.get("message", "Monthly usage limit reached."),
                    "limit": detail,
                })
                continue

            req_session_id = data.get("session_id") or ""
            session_id, auto_created = _resolve_session(uid, req_session_id)

            if auto_created:
                await ws.send_json({"type": "session", "session_id": session_id})

            history = load_chat_history(uid, session_id=session_id)
            user_msg = {"role": "user", "content": message, "created_at": datetime.now(timezone.utc).isoformat()}
            save_chat_message(uid, user_msg, session_id=session_id)
            increment_chat_message_count(uid)

            from core.grok_agent import run_orryon_stream

            full_text = ""
            try:
                async for event in run_orryon_stream(
                    user_message=message,
                    user_id=uid,
                    chat_history=history,
                    user_name=ctx["display_name"],
                    session_id=session_id,
                    tier=ctx["plan"],
                    mode="golden" if ctx["golden_mode"] else "adult",
                    life_priorities=ctx.get("life_priorities") or [],
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
                        event["voice_overlay"] = (
                            ctx["plan"] == "premium_plus" and ctx["voice_overlay"]
                        )
                    await ws.send_json(event)
            except Exception:
                logger.exception("WS chat error")
                await ws.send_json({"type": "error", "message": USER_FACING_CHAT_ERROR})

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.error("WS unexpected error: %s", exc)


# ── WebSocket ticket issuance ─────────────────────────────────────────────────

@router.post("/api/chat/ws-ticket")
async def chat_ws_ticket(user: dict = Depends(get_current_user)):
    """
    Mint a one-time, 30-second ticket for authenticating a WebSocket connection
    to /ws/chat. The browser uses this instead of the long-lived JWT so the
    raw token never appears in the WS URL (and therefore never in logs).
    """
    ticket = create_ws_ticket(user["user_id"], user["email"])
    return {"ticket": ticket, "expires_in": 30}


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


class _SessionRenameReq(BaseModel):
    title: str


@router.patch("/api/chat/sessions/{session_id}")
async def rename_session(
    session_id: str,
    body: _SessionRenameReq,
    user: dict = Depends(get_current_user),
):
    """Update a chat session title."""
    title = (body.title or "").strip()
    if not title:
        raise HTTPException(400, "Title is required")
    if len(title) > 120:
        raise HTTPException(400, "Title too long (max 120 characters)")
    ok = update_chat_session_title(user["user_id"], session_id, title)
    if not ok:
        raise HTTPException(500, "Could not rename session")
    return {"updated": True, "title": title}
