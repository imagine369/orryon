"""
backend/routers/audit.py — Agent destructive-action audit log.

Destructive delete tools do NOT use a pending approval queue today. Flow:
  1. Agent calls delete_* without user_confirmed → chat emits confirm_required
  2. User confirms in the DeleteConfirmModal → retry with user_confirmed=true
  3. After successful delete, registry logs status=approved here (audit only)

GET /api/audit/history — completed agent-driven destructive actions

Human-in-the-loop approve/reject (pending queue) is reserved for APPROVALS_HITL_ENABLED
and lives under /api/approvals/* — not wired to delete tools yet.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from backend.auth import get_current_user
from db.approvals import get_approval_requests

router = APIRouter(tags=["audit"])


def _audit_entries(user_id: str) -> list[dict]:
    items = get_approval_requests(user_id, status=None)
    return [a for a in items if a.get("status") != "pending"]


@router.get("/api/audit/history")
async def audit_history(user: dict = Depends(get_current_user)):
    entries = _audit_entries(user["user_id"])
    return {
        "entries": entries,
        "count": len(entries),
        "policy": {
            "destructive_confirmation": "in_chat",
            "pending_queue": "not_used_for_deletes",
            "description": (
                "Deletes are confirmed in chat before execution. This log records "
                "completed agent-driven destructive actions only."
            ),
        },
    }
