"""
backend/routers/voice.py — xAI Speech-to-Text and Text-to-Speech endpoints.

Thin, authenticated proxies in front of xAI's voice endpoints (launched 2026-04-17).
The browser never sees XAI_API_KEY — it is injected server-side, identical to
how we handle Grok chat completions and receipt vision.

Endpoints:
    POST /api/voice/stt   (multipart "file")  → {"text": "..."}
    POST /api/voice/tts   (json {text, voice}) → audio/mpeg (MP3 bytes)

Rate-limited per user (in-memory + Redis-backed bucket) and billed against the
same monthly spend cap as chat so voice can't be used to sidestep quota.
"""

from __future__ import annotations

import logging
import os

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from backend.auth import get_current_user
from backend.cache import check_rate_limit_async
from backend.deps import MONTHLY_SPEND_CAP_USD
from backend.signing import require_signed_request
from config import XAI_API_KEY
from db import get_monthly_spend

logger = logging.getLogger(__name__)

router = APIRouter(tags=["voice"])


# ── Config ────────────────────────────────────────────────────────────────────

_XAI_BASE = "https://api.x.ai/v1"
_STT_URL = f"{_XAI_BASE}/stt"
_TTS_URL = f"{_XAI_BASE}/tts"

# xAI STT has a single global model — it does NOT accept a `model` request
# field (unlike OpenAI's Whisper API). Sending one returns 400.
# Reference: https://docs.x.ai/developers/model-capabilities/audio/speech-to-text

# Default voice for Orryon — `sal` ("smooth, balanced, versatile") of the five
# xAI voices is the closest match to the voice direction brief in
# docs/voice-direction.md: warm enough for breathing guidance, grounded enough
# for finance. Overridable via env without a redeploy.
_DEFAULT_VOICE = os.getenv("XAI_TTS_VOICE", "sal")

# Default language — BCP-47 code. xAI requires this field on every TTS call
# and uses it on STT to enable text formatting (numbers / currencies / units).
_DEFAULT_LANGUAGE = os.getenv("XAI_TTS_LANGUAGE", "en")

# Hard caps: 25 MB audio upload (≈ 15 min at 256 kbps), 4000 characters for TTS.
_STT_MAX_BYTES = 25 * 1024 * 1024
_TTS_MAX_CHARS = 4000

# Common browser-produced audio mimetypes. xAI accepts most; we pass through.
_STT_ALLOWED_MIME_PREFIXES = ("audio/", "video/webm", "video/mp4")


# ── Schemas ───────────────────────────────────────────────────────────────────

class TTSReq(BaseModel):
    text: str = Field(min_length=1, max_length=_TTS_MAX_CHARS)
    voice: str | None = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _require_key() -> None:
    if not XAI_API_KEY:
        raise HTTPException(status_code=503, detail="Voice service is not configured on the server.")


async def _enforce_voice_quota(uid: str, kind: str) -> None:
    """Per-user + global rate limits; monthly spend cap shared with chat."""
    # 20 voice calls/min per user, 600/hour globally. Tuned to prevent runaway costs
    # if a client-side loop gets stuck holding the mic open.
    if not await check_rate_limit_async(f"voice:{kind}:user:{uid}", limit=20, window_seconds=60):
        raise HTTPException(status_code=429, detail="Too many voice requests — please wait a moment.")
    if not await check_rate_limit_async(f"voice:{kind}:global", limit=600, window_seconds=3600):
        logger.warning("Global voice %s rate limit hit (user=%s).", kind, uid)
        raise HTTPException(status_code=429, detail="Voice service is temporarily busy — please try again soon.")

    if get_monthly_spend(uid) >= MONTHLY_SPEND_CAP_USD:
        raise HTTPException(status_code=402, detail="You have reached your monthly usage limit. It resets on the 1st of next month.")


# ── STT ───────────────────────────────────────────────────────────────────────

@router.post("/api/voice/stt")
async def speech_to_text(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
    _signed: dict = Depends(require_signed_request),
) -> dict:
    """
    Transcribe an audio clip using xAI STT.

    Body: multipart/form-data with field `file` (e.g. audio/webm, audio/mp4, audio/wav).
    Returns: {"text": "transcribed words"}
    """
    _require_key()
    uid = user["user_id"]
    await _enforce_voice_quota(uid, "stt")

    mime = (file.content_type or "audio/webm").lower()
    if not any(mime.startswith(p) for p in _STT_ALLOWED_MIME_PREFIXES):
        raise HTTPException(status_code=415, detail="Unsupported audio type.")

    contents = await file.read(_STT_MAX_BYTES + 1)
    if len(contents) > _STT_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Audio clip is too long (max 25 MB).")
    if not contents:
        raise HTTPException(status_code=400, detail="Empty audio upload.")

    # xAI STT multipart shape: `language` + `format` first, then `file` last.
    # The docs explicitly require `file` to be the final multipart field, and
    # there is NO `model` parameter — the service has one global model.
    # `format=true` + `language` turns on Inverse Text Normalization so numbers,
    # currencies, and units come back as "$167" / "42 dollars" rather than
    # spelled-out words, which materially improves the Orryon expense flow.
    data = {"language": _DEFAULT_LANGUAGE, "format": "true"}
    files = {"file": (file.filename or "audio.webm", contents, mime)}
    headers = {"Authorization": f"Bearer {XAI_API_KEY}"}

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(_STT_URL, headers=headers, data=data, files=files)
    except httpx.TimeoutException:
        logger.warning("STT timed out for user=%s", uid)
        raise HTTPException(status_code=504, detail="Transcription timed out. Please try again.")
    except httpx.HTTPError as exc:
        logger.exception("STT network error for user=%s: %s", uid, exc)
        raise HTTPException(status_code=502, detail="Could not reach the voice service.")

    if resp.status_code >= 400:
        # Log full upstream body so we can debug future API shape drift, but
        # surface a terse, user-facing message that still distinguishes the
        # main failure modes (auth vs. quota vs. unsupported audio).
        logger.error("xAI STT error (status=%s) for user=%s: %s", resp.status_code, uid, resp.text[:500])
        if resp.status_code == 401:
            raise HTTPException(status_code=503, detail="Voice service is not configured on the server.")
        if resp.status_code == 413:
            raise HTTPException(status_code=413, detail="Audio clip is too long.")
        if resp.status_code == 429:
            raise HTTPException(status_code=429, detail="Voice service is busy — please try again in a moment.")
        if resp.status_code == 400:
            # Most commonly: unsupported audio format for whatever the browser recorded.
            raise HTTPException(status_code=400, detail="Couldn't process that recording — try again.")
        raise HTTPException(status_code=502, detail="Transcription failed. Please try again.")

    try:
        body = resp.json()
    except Exception:
        logger.error("xAI STT returned non-JSON for user=%s: %s", uid, resp.text[:500])
        raise HTTPException(status_code=502, detail="Voice service returned an unexpected response.")

    text = (body.get("text") or body.get("transcript") or "").strip()
    return {"text": text}


# ── TTS ───────────────────────────────────────────────────────────────────────

@router.post("/api/voice/tts")
async def text_to_speech(
    body: TTSReq,
    user: dict = Depends(get_current_user),
    _signed: dict = Depends(require_signed_request),
) -> Response:
    """
    Synthesize speech from text using xAI TTS.

    Body: {"text": "hello", "voice": "eve"}
    Returns: audio/mpeg (MP3 bytes)
    """
    _require_key()
    uid = user["user_id"]
    await _enforce_voice_quota(uid, "tts")

    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Empty text.")

    voice = (body.voice or _DEFAULT_VOICE).strip() or _DEFAULT_VOICE

    # xAI TTS payload shape per docs.x.ai/developers/model-capabilities/audio/text-to-speech
    # (`text` / `voice_id` / `language`, not the OpenAI-compatible `input` / `voice` / `format`).
    payload = {
        "text": text,
        "voice_id": voice,
        "language": _DEFAULT_LANGUAGE,
    }
    headers = {
        "Authorization": f"Bearer {XAI_API_KEY}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(_TTS_URL, headers=headers, json=payload)
    except httpx.TimeoutException:
        logger.warning("TTS timed out for user=%s", uid)
        raise HTTPException(status_code=504, detail="Voice synthesis timed out. Please try again.")
    except httpx.HTTPError as exc:
        logger.exception("TTS network error for user=%s: %s", uid, exc)
        raise HTTPException(status_code=502, detail="Could not reach the voice service.")

    if resp.status_code >= 400:
        logger.error("xAI TTS error (status=%s) for user=%s: %s", resp.status_code, uid, resp.text[:500])
        raise HTTPException(status_code=502, detail="Voice synthesis failed. Please try again.")

    # Stream audio bytes straight back to the client.
    audio_type = resp.headers.get("content-type", "audio/mpeg")
    return Response(content=resp.content, media_type=audio_type)
