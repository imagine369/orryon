"""
backend/routers/admin.py — Admin-only endpoints.

All routes here require the authenticated user to be the designated admin
(CONTACT_EMAIL / sato@orryon.com). Returns 403 for everyone else.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from backend.auth import get_current_user
from config import CONTACT_EMAIL
from db import get_connection

logger = logging.getLogger(__name__)

router = APIRouter(tags=["admin"])


def _require_admin(user: dict = Depends(get_current_user)) -> dict:
    """FastAPI dependency — only the admin email may call these endpoints."""
    admin_email = (CONTACT_EMAIL or "").strip().lower()
    if not admin_email or user.get("email", "").strip().lower() != admin_email:
        raise HTTPException(403, "Admin access required.")
    return user


def _fmt_user(row: dict) -> dict:
    """Normalize a user row for the admin API response."""
    plan = row.get("plan") or "free"
    segment = row.get("segment") or ""
    trial_ends_at = row.get("trial_ends_at") or ""
    billing_interval = row.get("billing_interval") or ""

    # Compute days remaining on trial
    trial_days_remaining: int | None = None
    if plan == "trial" and trial_ends_at:
        try:
            ends = datetime.fromisoformat(trial_ends_at.replace("Z", "+00:00"))
            delta = (ends - datetime.now(timezone.utc)).days
            trial_days_remaining = max(delta, 0)
        except Exception:
            pass

    return {
        "id": row.get("id"),
        "email": row.get("email"),
        "display_name": row.get("display_name") or "",
        "plan": plan,
        "segment": segment,
        "billing_interval": billing_interval,
        "trial_ends_at": trial_ends_at,
        "trial_days_remaining": trial_days_remaining,
        "created_at": row.get("created_at") or "",
        "stripe_customer_id": row.get("stripe_customer_id") or "",
        "stripe_subscription_id": row.get("stripe_subscription_id") or "",
    }


@router.get("/api/admin/users")
async def admin_list_users(_admin: dict = Depends(_require_admin)) -> dict:
    """Return all users grouped by segment/plan for the admin dashboard."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM users ORDER BY created_at DESC"
        ).fetchall()

    users = [_fmt_user(dict(r)) for r in rows]

    free_breathe = [u for u in users if u["segment"] == "free_breathe"]
    trial        = [u for u in users if u["plan"] == "trial" and u["segment"] != "free_breathe"]
    pro          = [u for u in users if u["plan"] == "pro"]
    demo         = [u for u in users if u["email"] == "demo@orryon.app"]
    other        = [u for u in users if u not in free_breathe and u not in trial and u not in pro and u not in demo]

    return {
        "total": len(users),
        "counts": {
            "free_breathe": len(free_breathe),
            "trial": len(trial),
            "pro": len(pro),
            "other": len(other),
        },
        "groups": {
            "free_breathe": free_breathe,
            "trial": trial,
            "pro": pro,
            "other": other,
        },
        "all": users,
    }
