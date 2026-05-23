"""
backend/routers/account_data.py — User data export and read-only share links.

Extracted from account.py (Phase 2c).
"""
from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from backend.deps import require_active_plan
from config import APP_URL
from db import get_connection, insert_row

router = APIRouter(tags=["account"])

# ── Export ────────────────────────────────────────────────────────────────────

@router.get("/api/export")
async def export_data(user: dict = Depends(require_active_plan)):
    """Download all user data as a ZIP file containing the SQLite DB and JSON."""
    from core.export import build_user_export_zip

    zip_bytes = build_user_export_zip(user["user_id"])
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=orryon_export.zip"},
    )


# ── Share ─────────────────────────────────────────────────────────────────────

@router.post("/api/share")
async def create_share_link(user: dict = Depends(require_active_plan)):
    uid = user["user_id"]
    with get_connection() as conn:
        existing = conn.execute(
            "SELECT token FROM share_tokens WHERE user_id=? AND is_active=1 AND view_type='finance_readonly'",
            (uid,),
        ).fetchone()
    if existing:
        return {"token": existing["token"], "url": f"{APP_URL}?share_token={existing['token']}"}
    token = secrets.token_urlsafe(16)
    insert_row("share_tokens", {
        "id": str(uuid.uuid4()), "user_id": uid, "token": token,
        "view_type": "finance_readonly", "is_active": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"token": token, "url": f"{APP_URL}?share_token={token}"}


@router.get("/api/share/{token}")
async def get_shared_dashboard(token: str):
    """Public endpoint — no auth required. Returns a read-only dashboard snapshot."""
    from datetime import date
    from db import get_balance

    with get_connection() as conn:
        tok_row = conn.execute(
            "SELECT user_id FROM share_tokens WHERE token=? AND is_active=1 AND view_type='finance_readonly'",
            (token,),
        ).fetchone()
        if not tok_row:
            raise HTTPException(404, "Invalid or expired share link")
        uid = tok_row["user_id"]
        today = date.today()
        month_start = today.replace(day=1).isoformat()

        balance = get_balance(uid)
        month_row = conn.execute(
            "SELECT COALESCE(SUM(amount),0) as total FROM transactions "
            "WHERE user_id=? AND date>=? AND amount>0", (uid, month_start),
        ).fetchone()
        cats = conn.execute(
            "SELECT category, SUM(amount) as total FROM transactions "
            "WHERE user_id=? AND date>=? AND amount>0 GROUP BY category ORDER BY total DESC LIMIT 5",
            (uid, month_start),
        ).fetchall()

    return {
        "balance": balance,
        "month_spend": float(month_row["total"]) if month_row else 0,
        "top_categories": [{"category": c["category"], "total": float(c["total"])} for c in cats],
    }
