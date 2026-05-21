"""
backend/routers/approvals.py — Approval requests and agent action audit trail.

Agent delete tools log completed actions as status=approved (see registry.execute_tool).
Human-in-the-loop approve/reject is reserved for future UI.

GET  /api/approvals              — list pending approval requests
POST /api/approvals/{id}/approve — approve an action
POST /api/approvals/{id}/reject  — reject an action
GET  /api/approvals/history      — resolved + agent audit entries
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from backend.auth import get_current_user
from backend.deps import require_active_plan
from db import get_approval_requests, resolve_approval_request

router = APIRouter(tags=["approvals"], dependencies=[Depends(require_active_plan)])


@router.get("/api/approvals")
async def list_pending(user: dict = Depends(get_current_user)):
    items = get_approval_requests(user["user_id"], status="pending")
    return {"approvals": items, "count": len(items)}


@router.get("/api/approvals/history")
async def approval_history(user: dict = Depends(get_current_user)):
    items = get_approval_requests(user["user_id"], status=None)
    return {"approvals": [a for a in items if a["status"] != "pending"]}


@router.post("/api/approvals/{approval_id}/approve")
async def approve_action(approval_id: str, user: dict = Depends(get_current_user)):
    ok = resolve_approval_request(user["user_id"], approval_id, "approved")
    if not ok:
        raise HTTPException(404, "Approval request not found or already resolved")
    return {"status": "approved"}


@router.post("/api/approvals/{approval_id}/reject")
async def reject_action(approval_id: str, user: dict = Depends(get_current_user)):
    ok = resolve_approval_request(user["user_id"], approval_id, "rejected")
    if not ok:
        raise HTTPException(404, "Approval request not found or already resolved")
    return {"status": "rejected"}
