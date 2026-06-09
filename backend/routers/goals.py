"""Savings goals and contribution endpoints."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.auth import get_current_user
from backend.deps import require_active_plan
from backend.schemas import GoalReq, GoalUpdate
from db import get_connection, insert_row, update_row

router = APIRouter(tags=["goals"], dependencies=[Depends(require_active_plan)])


@router.get("/api/goals")
async def list_goals(
    include_completed: bool = Query(False),
    user: dict = Depends(get_current_user),
):
    uid = user["user_id"]
    with get_connection() as conn:
        if include_completed:
            rows = conn.execute(
                "SELECT * FROM goals WHERE user_id=? ORDER BY is_completed ASC, created_at DESC", (uid,)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM goals WHERE user_id=? AND is_completed=0 ORDER BY created_at DESC", (uid,)
            ).fetchall()
    return [dict(r) for r in rows]


@router.post("/api/goals")
async def create_goal(body: GoalReq, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    goal_id = str(uuid.uuid4())
    insert_row("goals", {
        "id": goal_id, "user_id": uid, "name": body.name,
        "target_amount": body.target_amount, "current_amount": 0,
        "target_date": body.target_date, "category": body.category,
        "linked_budget_category": "", "notes": body.notes,
        "created_at": datetime.now(timezone.utc).isoformat(), "is_completed": 0,
    })
    return {"id": goal_id}


@router.patch("/api/goals/{goal_id}")
async def update_goal(goal_id: str, body: GoalUpdate, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")

    conn = get_connection()
    try:
        old = conn.execute(
            "SELECT current_amount FROM goals WHERE id=? AND user_id=?", (goal_id, uid)
        ).fetchone()
    finally:
        conn.close()
    if not old:
        raise HTTPException(404, "Goal not found")

    if "current_amount" in updates:
        delta = float(updates["current_amount"]) - float(old["current_amount"])
        if delta != 0:
            insert_row("goal_contributions", {
                "id": str(uuid.uuid4()),
                "goal_id": goal_id,
                "user_id": uid,
                "amount": delta,
                "note": "",
                "created_at": datetime.now(timezone.utc).isoformat(),
            })

    update_row("goals", updates, {"id": goal_id, "user_id": uid})
    return {"updated": True}


@router.get("/api/goals/{goal_id}/contributions")
async def get_goal_contributions(goal_id: str, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM goal_contributions WHERE goal_id=? AND user_id=? ORDER BY created_at DESC",
            (goal_id, uid),
        ).fetchall()
    return [dict(r) for r in rows]


@router.post("/api/goals/{goal_id}/contributions")
async def add_goal_contribution(goal_id: str, body: dict, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    amount = float(body.get("amount", 0))
    if amount == 0:
        raise HTTPException(400, "Amount required")
    conn = get_connection()
    try:
        goal = conn.execute(
            "SELECT current_amount FROM goals WHERE id=? AND user_id=?", (goal_id, uid)
        ).fetchone()
    finally:
        conn.close()
    if not goal:
        raise HTTPException(404, "Goal not found")
    new_amount = float(goal["current_amount"]) + amount
    update_row("goals", {"current_amount": new_amount}, {"id": goal_id, "user_id": uid})
    insert_row("goal_contributions", {
        "id": str(uuid.uuid4()),
        "goal_id": goal_id,
        "user_id": uid,
        "amount": amount,
        "note": body.get("note", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"current_amount": new_amount}
