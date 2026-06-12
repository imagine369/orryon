"""
backend/routers/fulfillment.py — Instant fulfillment handoffs (deeplink orchestration).

Privacy: returns user-owned handoff rows only. External checkout happens in partner apps.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException

from pydantic import BaseModel, Field

from backend.deps import ENABLE_DEMO, IS_PRODUCTION, require_active_plan
from backend.auth import get_current_user
from config import FULFILLMENT_ENABLED
from core.integrations.fulfillment.demo_seed import seed_marketing_handoffs
from core.integrations.fulfillment.handoff import create_handoffs, dismiss_handoff, get_pending_handoffs

router = APIRouter(tags=["fulfillment"], dependencies=[Depends(require_active_plan)])
logger = logging.getLogger(__name__)


class CreateHandoffReq(BaseModel):
    title: str = Field(min_length=1)
    type: str = "errand"


@router.get("/api/fulfillment/handoffs")
async def list_handoffs(user: dict = Depends(get_current_user)):
    if not FULFILLMENT_ENABLED:
        return {"enabled": False, "handoffs": []}
    uid = user["user_id"]
    try:
        handoffs = get_pending_handoffs(uid)
    except Exception:
        logger.exception("list_handoffs failed for user %s", uid)
        raise HTTPException(status_code=500, detail="Could not load handoffs")
    return {"enabled": True, "handoffs": handoffs}


@router.post("/api/fulfillment/handoffs")
async def create_handoff(body: CreateHandoffReq, user: dict = Depends(get_current_user)):
    if not FULFILLMENT_ENABLED:
        raise HTTPException(status_code=404, detail="Fulfillment not enabled")
    batch = create_handoffs(
        user["user_id"],
        [{"type": body.type.strip().lower(), "title": body.title.strip()}],
    )
    created = batch["handoffs"]
    if not created:
        detail = "Could not create handoff"
        if batch.get("skipped"):
            detail = batch["skipped"][0].get("reason", detail)
        raise HTTPException(status_code=400, detail=detail)
    return {"handoff": created[0]}


@router.post("/api/fulfillment/demo/seed")
async def seed_demo_handoffs(user: dict = Depends(get_current_user)):
    """Seed marketing sample handoffs (localhost dev only — ENABLE_DEMO=1)."""
    if IS_PRODUCTION or not ENABLE_DEMO:
        raise HTTPException(status_code=404, detail="Demo seed not available")
    if not FULFILLMENT_ENABLED:
        raise HTTPException(status_code=404, detail="Fulfillment not enabled")
    handoffs = seed_marketing_handoffs(user["user_id"], force=True)
    return {"status": "ok", "count": len(handoffs), "handoffs": handoffs}


@router.post("/api/fulfillment/handoffs/{handoff_id}/dismiss")
async def dismiss(handoff_id: str, user: dict = Depends(get_current_user)):
    if not FULFILLMENT_ENABLED:
        raise HTTPException(status_code=404, detail="Fulfillment not enabled")
    ok = dismiss_handoff(user["user_id"], handoff_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Handoff not found")
    return {"status": "ok"}
