"""
backend/routers/approvals.py — Reserved HITL approval queue (feature-flagged).

Agent delete tools today use in-chat confirmation (confirm_required + user_confirmed),
not this queue. Completed deletes are logged to GET /api/audit/history.

When APPROVALS_HITL_ENABLED=1:
  GET  /api/approvals              — pending approval requests
  POST /api/approvals/{id}/approve
  POST /api/approvals/{id}/reject

Legacy alias (same data as audit log):
  GET  /api/approvals/history
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from backend.auth import get_current_user
from backend.deps import require_active_plan
from backend.routers.audit import _audit_entries
from config import APPROVALS_HITL_ENABLED
from db.approvals import (
    get_approval_requests,
    resolve_approval_request,
)

router = APIRouter(tags=["approvals"], dependencies=[Depends(require_active_plan)])


def _require_hitl() -> None:
    if not APPROVALS_HITL_ENABLED:
        raise HTTPException(404, "Not found")


@router.get("/api/approvals")
async def list_pending(user: dict = Depends(get_current_user)):
    _require_hitl()
    items = get_approval_requests(user["user_id"], status="pending")
    return {"approvals": items, "count": len(items)}


@router.get("/api/approvals/history")
async def approval_history(user: dict = Depends(get_current_user)):
    """Deprecated alias for /api/audit/history — same completed audit entries."""
    entries = _audit_entries(user["user_id"])
    return {
        "approvals": entries,
        "count": len(entries),
        "deprecated": "Use GET /api/audit/history",
    }


@router.post("/api/approvals/{approval_id}/approve")
async def approve_action(approval_id: str, user: dict = Depends(get_current_user)):
    _require_hitl()
    ok = resolve_approval_request(user["user_id"], approval_id, "approved")
    if not ok:
        raise HTTPException(404, "Approval request not found or already resolved")
    return {"status": "approved"}


@router.post("/api/approvals/{approval_id}/reject")
async def reject_action(approval_id: str, user: dict = Depends(get_current_user)):
    _require_hitl()
    ok = resolve_approval_request(user["user_id"], approval_id, "rejected")
    if not ok:
        raise HTTPException(404, "Approval request not found or already resolved")
    return {"status": "rejected"}
