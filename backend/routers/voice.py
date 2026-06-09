"""
backend/routers/voice.py — xAI Speech-to-Text and Text-to-Speech endpoints.

Thin, authenticated proxies in front of xAI's voice endpoints (launched 2026-04-17).
The browser never sees XAI_API_KEY — it is injected server-side, identical to
how we handle Grok chat completions and receipt vision.

Endpoints:
    POST /api/voice/stt   (multipart "file")  → {"text": "..."}
    POST /api/voice/tts   (json {text, voice}) → audio/mpeg (MP3 bytes)
    GET  /api/voice/usage                      → voice usage summary for the month

Rate-limited per user (in-memory + Redis-backed bucket) and billed against the
same monthly spend cap as chat so voice can't be used to sidestep quota.

Voice minute caps (see backend/deps.VOICE_LIMITS_MINUTES):
    Free/Starter                : no STT/TTS (Breathe only; orb-tts for wellness)
    Trial / Pro                 : no STT/TTS (text Life OS only)
    Premium                     : speak-in pool; text replies; chat mic
    Premium Plus                : larger pool + TTS when voice_overlay enabled

Users can purchase 60-minute top-ups ($6) via /api/voice/topup.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from backend.auth import get_current_user
from backend.cache import check_rate_limit_async
from backend.deps import (
    check_monthly_api_quota,
    get_voice_limit_minutes,
    require_voice_input_plan,
    require_voice_output_plan,
    resolve_plan_for_user,
)
from backend.signing import require_signed_request
from config import XAI_API_KEY, ELEVENLABS_API_KEY
from db.usage import (
    get_voice_seconds_used,
    get_voice_topup_minutes,
    record_voice_seconds,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["voice"])


# ── Config ────────────────────────────────────────────────────────────────────

_XAI_BASE = "https://api.x.ai/v1"
_STT_URL = f"{_XAI_BASE}/stt"
_TTS_URL = f"{_XAI_BASE}/tts"

_EL_BASE = "https://api.elevenlabs.io/v1"
_EL_ORB_VOICE_ID = os.getenv("ELEVENLABS_ORB_VOICE_ID", "DKfKzHbGIi7qsCsZWN8G")
_EL_MODEL = "eleven_multilingual_v2"

_DEFAULT_LANGUAGE = os.getenv("XAI_TTS_LANGUAGE", "en")

_STT_MAX_BYTES = 25 * 1024 * 1024
_TTS_MAX_CHARS = 4000
_ORB_TTS_MAX_CHARS = 240  # short breathing cues only

_STT_ALLOWED_MIME_PREFIXES = ("audio/", "video/webm", "video/mp4")

# MP3 at 128 kbps ≈ 16 000 bytes/second — used to estimate audio duration from
# raw byte count for both TTS output and STT input.
_BYTES_PER_SECOND_ESTIMATE = 16_000
_MAX_STT_SECONDS_PER_REQUEST = 300  # 5 min — aligns with chat mic auto-stop


# ── Schemas ───────────────────────────────────────────────────────────────────

class TTSReq(BaseModel):
    text: str = Field(min_length=1, max_length=_TTS_MAX_CHARS)


class OrbTTSReq(BaseModel):
    text: str = Field(min_length=1, max_length=_ORB_TTS_MAX_CHARS)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _require_key() -> None:
    if not XAI_API_KEY:
        raise HTTPException(status_code=503, detail="Voice service is not configured on the server.")


import re as _re

_ORRYON_VARIANTS = _re.compile(
    r"\b(orr?i[ao]n|or[iy][ao]n|ori[ao]n|oryon|ory[ao]n|orrian|orrion|or\s*yon)\b",
    _re.IGNORECASE,
)

def _fix_brand_names(text: str) -> str:
    return _ORRYON_VARIANTS.sub("Orryon", text)


def _estimate_audio_seconds(byte_count: int) -> float:
    """Rough duration estimate from raw byte count (MP3/WebM ≈ 128 kbps)."""
    if byte_count <= 0:
        return 0.0
    return max(0.0, byte_count / _BYTES_PER_SECOND_ESTIMATE)


def _get_voice_budget(uid: str) -> tuple[int, float, int]:
    """Return (limit_minutes, seconds_used, topup_minutes) for uid this month."""
    plan_info = resolve_plan_for_user(uid)
    plan = plan_info["plan"]
    limit_min = get_voice_limit_minutes(plan)
    month = datetime.now(timezone.utc).strftime("%Y-%m")
    secs_used = get_voice_seconds_used(uid, month)
    topup_min = get_voice_topup_minutes(uid, month)
    return limit_min, secs_used, topup_min


async def _enforce_voice_quota(uid: str, kind: str) -> None:
    """Per-user rate limits, monthly spend cap, and voice-minute cap."""
    if not await check_rate_limit_async(f"voice:{kind}:user:{uid}", limit=20, window_seconds=60):
        raise HTTPException(status_code=429, detail="Too many voice requests — please wait a moment.")
    if not await check_rate_limit_async(f"voice:{kind}:global", limit=600, window_seconds=3600):
        logger.warning("Global voice %s rate limit hit (user=%s).", kind, uid)
        raise HTTPException(status_code=429, detail="Voice service is temporarily busy — please try again soon.")

    plan_info = resolve_plan_for_user(uid)
    check_monthly_api_quota(uid, plan_info["plan"])

    # Voice-minute cap check
    limit_min, secs_used, topup_min = _get_voice_budget(uid)
    total_limit_secs = (limit_min + topup_min) * 60
    if limit_min > 0 and secs_used >= total_limit_secs:
        mins_used = round(secs_used / 60, 1)
        raise HTTPException(
            status_code=402,
            detail={
                "code": "voice_limit_reached",
                "message": (
                    "You've used all your included voice minutes this month. "
                    "Orryon has been talking with you a lot!"
                ),
                "minutes_used": mins_used,
                "limit_minutes": limit_min + topup_min,
            },
        )


async def _enforce_orb_quota(uid: str) -> None:
    """Rate-limit breathe orb TTS — does not consume chat voice-minute pools."""
    if not await check_rate_limit_async(f"voice:orb:user:{uid}", limit=30, window_seconds=60):
        raise HTTPException(status_code=429, detail="Too many breathe audio requests — please wait.")
    if not await check_rate_limit_async("voice:orb:global", limit=800, window_seconds=3600):
        logger.warning("Global orb TTS rate limit hit (user=%s).", uid)
        raise HTTPException(status_code=429, detail="Breathe audio is temporarily busy — try again soon.")


# ── STT ───────────────────────────────────────────────────────────────────────

@router.post("/api/voice/stt")
async def speech_to_text(
    file: UploadFile = File(...),
    user: dict = Depends(require_voice_input_plan),
    _signed: dict = Depends(require_signed_request),
) -> dict:
    """
    Transcribe an audio clip using xAI STT.

    Body: multipart/form-data with field `file`.
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

    audio_seconds = _estimate_audio_seconds(len(contents))
    if audio_seconds > _MAX_STT_SECONDS_PER_REQUEST:
        raise HTTPException(
            status_code=413,
            detail="Audio clip is too long. Record a shorter message (about 5 minutes max).",
        )

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
        logger.error("xAI STT error (status=%s) for user=%s: %s", resp.status_code, uid, resp.text[:500])
        if resp.status_code == 401:
            raise HTTPException(status_code=503, detail="Voice service is not configured on the server.")
        if resp.status_code == 413:
            raise HTTPException(status_code=413, detail="Audio clip is too long.")
        if resp.status_code == 429:
            raise HTTPException(status_code=429, detail="Voice service is busy — please try again in a moment.")
        if resp.status_code == 400:
            raise HTTPException(status_code=400, detail="Couldn't process that recording — try again.")
        raise HTTPException(status_code=502, detail="Transcription failed. Please try again.")

    try:
        body = resp.json()
    except Exception:
        logger.error("xAI STT returned non-JSON for user=%s: %s", uid, resp.text[:500])
        raise HTTPException(status_code=502, detail="Voice service returned an unexpected response.")

    # Record usage only on success
    record_voice_seconds(uid, audio_seconds)

    text = _fix_brand_names((body.get("text") or body.get("transcript") or "").strip())
    return {"text": text}


# ── TTS ───────────────────────────────────────────────────────────────────────

@router.post("/api/voice/tts")
async def text_to_speech(
    body: TTSReq,
    user: dict = Depends(require_voice_output_plan),
    _signed: dict = Depends(require_signed_request),
) -> Response:
    """
    Synthesize speech from text using xAI TTS using Orryon's voice (eve).

    Premium Plus only — Premium gets text replies. Eve is Orryon's chat voice.

    Body: {"text": "hello"}
    Returns: audio/mpeg (MP3 bytes)
    """
    _require_key()
    uid = user["user_id"]
    await _enforce_voice_quota(uid, "tts")

    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Empty text.")

    payload = {
        "text": text,
        "voice_id": "eve",
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

    # Record usage from actual audio byte size
    audio_seconds = _estimate_audio_seconds(len(resp.content))
    record_voice_seconds(uid, audio_seconds)

    audio_type = resp.headers.get("content-type", "audio/mpeg")
    return Response(content=resp.content, media_type=audio_type)


# ── Voice Usage ───────────────────────────────────────────────────────────────

@router.get("/api/voice/usage")
async def get_voice_usage(user: dict = Depends(get_current_user)) -> dict:
    """
    Return the current user's voice minute usage for this month.

    Response:
        {
            "seconds_used": 4920.5,
            "minutes_used": 82.0,
            "limit_minutes": 150,
            "topup_minutes": 0,
            "total_available_minutes": 150,
            "remaining_minutes": 68.0,
            "plan": "pro",
            "reset_date": "2026-06-01"
        }
    """
    uid = user["user_id"]
    plan_info = resolve_plan_for_user(uid)
    plan = plan_info["plan"]
    limit_min = get_voice_limit_minutes(plan)

    month = datetime.now(timezone.utc).strftime("%Y-%m")
    secs_used = get_voice_seconds_used(uid, month)
    topup_min = get_voice_topup_minutes(uid, month)

    total_available = limit_min + topup_min
    mins_used = round(secs_used / 60, 1)
    remaining = max(0.0, round(total_available - mins_used, 1))

    # First day of next month as reset date
    y, m = int(month[:4]), int(month[5:7])
    if m == 12:
        reset_date = f"{y + 1}-01-01"
    else:
        reset_date = f"{y}-{m + 1:02d}-01"

    return {
        "seconds_used": round(secs_used, 1),
        "minutes_used": mins_used,
        "limit_minutes": limit_min,
        "topup_minutes": topup_min,
        "total_available_minutes": total_available,
        "remaining_minutes": remaining,
        "plan": plan,
        "reset_date": reset_date,
    }


# ── Orb TTS (ElevenLabs — Erin, Meditation Guide) ────────────────────────────

@router.post("/api/voice/orb-tts")
async def orb_text_to_speech(
    body: OrbTTSReq,
    user: dict = Depends(get_current_user),
    _signed: dict = Depends(require_signed_request),
) -> Response:
    """
    Synthesize orb / breathing cues using ElevenLabs Erin (Meditation Guide).

    Falls back to xAI TTS (eve voice) if ELEVENLABS_API_KEY is not configured.
    Orb TTS is NOT counted against voice-minute caps — it's part of the
    wellness experience, not the chat assistant.

    Body: {"text": "Breathe in."}
    Returns: audio/mpeg (MP3 bytes)
    """
    uid = user["user_id"]
    await _enforce_orb_quota(uid)

    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Empty text.")

    # ── ElevenLabs path ───────────────────────────────────────────────────────
    if ELEVENLABS_API_KEY:
        url = f"{_EL_BASE}/text-to-speech/{_EL_ORB_VOICE_ID}?output_format=mp3_44100_128"
        payload = {
            "text": text,
            "model_id": _EL_MODEL,
            "voice_settings": {
                "stability": 0.82,
                "similarity_boost": 0.75,
                "style": 0.0,
                "use_speaker_boost": False,
                "speed": 0.88,
            },
        }
        headers = {
            "xi-api-key": ELEVENLABS_API_KEY,
            "Content-Type": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(url, headers=headers, json=payload)
        except httpx.TimeoutException:
            logger.warning("ElevenLabs orb TTS timed out for user=%s", uid)
            raise HTTPException(status_code=504, detail="Voice synthesis timed out. Please try again.")
        except httpx.HTTPError as exc:
            logger.exception("ElevenLabs orb TTS network error for user=%s: %s", uid, exc)
            raise HTTPException(status_code=502, detail="Could not reach the voice service.")

        if resp.status_code >= 400:
            logger.error("ElevenLabs orb TTS error (status=%s) for user=%s: %s", resp.status_code, uid, resp.text[:500])
            if resp.status_code == 401:
                raise HTTPException(status_code=503, detail="Voice service is not configured on the server.")
            if resp.status_code == 429:
                raise HTTPException(status_code=429, detail="Voice service is busy — please try again in a moment.")
            raise HTTPException(status_code=502, detail="Voice synthesis failed. Please try again.")

        audio_type = resp.headers.get("content-type", "audio/mpeg")
        return Response(content=resp.content, media_type=audio_type)

    # ── xAI fallback (no ElevenLabs key configured) ───────────────────────────
    if not XAI_API_KEY:
        raise HTTPException(status_code=503, detail="Voice service is not configured on the server.")

    payload_xai = {
        "text": text,
        "voice_id": "eve",
        "language": _DEFAULT_LANGUAGE,
    }
    headers_xai = {
        "Authorization": f"Bearer {XAI_API_KEY}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(_TTS_URL, headers=headers_xai, json=payload_xai)
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Voice synthesis timed out. Please try again.")
    except httpx.HTTPError as exc:
        logger.exception("xAI fallback orb TTS error for user=%s: %s", uid, exc)
        raise HTTPException(status_code=502, detail="Could not reach the voice service.")

    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail="Voice synthesis failed. Please try again.")

    audio_type = resp.headers.get("content-type", "audio/mpeg")
    return Response(content=resp.content, media_type=audio_type)
