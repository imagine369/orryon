"""
backend/routers/receipts.py — Receipt image scan via Grok Vision.

Extracted from account.py (Phase 2c).
"""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from backend.cache import check_rate_limit_async
from backend.deps import check_monthly_api_quota, require_active_plan, resolve_plan_for_user
from config import GROK_MODEL
from core.user_xai import resolve_api_key
from db.usage import record_token_spend

logger = logging.getLogger(__name__)

router = APIRouter(tags=["account"])

# ── Receipt Scanning ─────────────────────────────────────────────────────────

# Cap uploads at 5 MB (matches CSV import) and accept only common image types.
_RECEIPT_MAX_BYTES = 5 * 1024 * 1024
_RECEIPT_ALLOWED_MIME = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
}


@router.post("/api/receipts/scan")
async def scan_receipt(file: UploadFile = File(...), user: dict = Depends(require_active_plan)):
    """Use Grok Vision to extract structured data from a receipt image."""
    import base64
    import re as re_module
    import httpx

    uid = user["user_id"]

    # Rate limit: 10 scans per 10 min per user, 200/hour globally.
    if not await check_rate_limit_async(f"receipt:user:{uid}", limit=10, window_seconds=600):
        raise HTTPException(status_code=429, detail="Too many receipt scans — please wait a minute.")
    if not await check_rate_limit_async("receipt:global", limit=200, window_seconds=3600):
        logger.warning("Global receipt scan rate limit hit (user=%s).", uid)
        raise HTTPException(status_code=429, detail="Receipt scanning is temporarily paused — please try again soon.")

    plan_info = resolve_plan_for_user(uid)
    check_monthly_api_quota(uid, plan_info["plan"])

    mime = (file.content_type or "image/jpeg").lower()
    if mime not in _RECEIPT_ALLOWED_MIME:
        raise HTTPException(status_code=415, detail="Unsupported file type. Upload a JPG, PNG, WEBP, or HEIC image.")

    # Read with a hard cap; refuse anything larger.
    contents = await file.read(_RECEIPT_MAX_BYTES + 1)
    if len(contents) > _RECEIPT_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Receipt image is too large (max 5 MB).")
    if not contents:
        raise HTTPException(status_code=400, detail="Empty upload.")

    b64 = base64.b64encode(contents).decode("utf-8")

    payload = {
        "model": GROK_MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{mime};base64,{b64}"},
                    },
                    {
                        "type": "text",
                        "text": (
                            "This is a receipt image. Extract the following and respond ONLY with valid JSON, no markdown:\n"
                            '{"merchant": "store name", "amount": 12.34, "date": "YYYY-MM-DD", "category": "one of: Food & Dining, Groceries, Transport, Entertainment, Shopping, Health & Fitness, Utilities, Travel, Subscriptions, Personal Care, Education, Other", "items": ["item1", "item2"]}\n'
                            "If you cannot determine a field, use null. Amount must be a number (total paid). Date must be YYYY-MM-DD format."
                        ),
                    },
                ],
            }
        ],
        "max_tokens": 300,
        "temperature": 0,
    }

    api_key = resolve_api_key(uid)
    if not api_key:
        raise HTTPException(
            503,
            "Add your Grok API key in Settings → Grok to scan receipts.",
        )
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post("https://api.x.ai/v1/chat/completions", headers=headers, json=payload)
    except httpx.TimeoutException:
        logger.warning("Receipt scan timed out for user=%s", uid)
        raise HTTPException(status_code=504, detail="Receipt scan timed out. Please try again.")
    except httpx.HTTPError as exc:
        logger.exception("Receipt scan network error for user=%s: %s", uid, exc)
        raise HTTPException(status_code=502, detail="Could not reach the receipt scanner right now.")

    if resp.status_code >= 400:
        # Never leak raw xAI errors to the client — just log server-side.
        logger.error("Receipt vision API error (status=%s) for user=%s: %s", resp.status_code, uid, resp.text[:500])
        raise HTTPException(status_code=502, detail="The receipt scanner couldn't process that image. Please try another photo.")

    try:
        body_json = resp.json()
    except Exception:
        logger.error("Receipt vision returned non-JSON for user=%s: %s", uid, resp.text[:500])
        raise HTTPException(status_code=502, detail="Receipt scanner returned an unexpected response.")

    # Meter token spend so vision calls count toward the monthly cap.
    try:
        usage = body_json.get("usage") or {}
        prompt_tokens = int(usage.get("prompt_tokens") or 0)
        completion_tokens = int(usage.get("completion_tokens") or 0)
        if prompt_tokens or completion_tokens:
            record_token_spend(uid, prompt_tokens, completion_tokens)
    except Exception as exc:
        logger.warning("Failed to record receipt scan token spend for user=%s: %s", uid, exc)

    try:
        raw = body_json["choices"][0]["message"]["content"].strip()
    except Exception:
        logger.error("Receipt vision response missing choices for user=%s: %s", uid, str(body_json)[:500])
        raise HTTPException(status_code=502, detail="Receipt scanner returned an unexpected response.")

    raw = re_module.sub(r"^```[a-z]*\n?", "", raw)
    raw = re_module.sub(r"\n?```$", "", raw)

    try:
        result = json.loads(raw)
    except Exception:
        logger.warning("Receipt vision returned unparseable JSON for user=%s: %s", uid, raw[:300])
        raise HTTPException(status_code=422, detail="Could not read the receipt — try a clearer photo.")

    return result
