"""
backend/routers/waitlist.py — Early-access waitlist endpoints.

Public endpoints (no auth required):
    POST /api/waitlist          — Add an email to the waitlist.

Admin endpoint (secret-key protected):
    GET  /api/admin/waitlist    — Download the full waitlist as CSV.
                                  Pass ?secret=<ADMIN_SECRET> env var.
"""

from __future__ import annotations

import csv
import io
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import db

router = APIRouter(tags=["waitlist"])


class WaitlistRequest(BaseModel):
    email: str


@router.post("/api/waitlist", status_code=201)
async def join_waitlist(body: WaitlistRequest):
    email = body.email.strip().lower()
    if not email or "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=422, detail="Invalid email address.")

    conn = db.get_connection()
    cur = conn.cursor()

    existing = cur.execute(
        "SELECT id FROM waitlist WHERE email = ?", (email,)
    ).fetchone()
    if existing:
        return {"status": "already_on_waitlist"}

    cur.execute(
        "INSERT INTO waitlist (id, email, created_at) VALUES (?, ?, ?)",
        (str(uuid.uuid4()), email, datetime.now(timezone.utc).isoformat()),
    )
    conn.commit()
    return {"status": "added"}


@router.get("/api/admin/waitlist")
async def export_waitlist(secret: str = ""):
    admin_secret = os.getenv("ADMIN_SECRET", "")
    if not admin_secret or secret != admin_secret:
        raise HTTPException(status_code=403, detail="Forbidden.")

    conn = db.get_connection()
    rows = conn.execute(
        "SELECT email, created_at FROM waitlist ORDER BY created_at ASC"
    ).fetchall()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["email", "joined_at"])
    for row in rows:
        writer.writerow([row["email"], row["created_at"]])
    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=waitlist.csv"},
    )
