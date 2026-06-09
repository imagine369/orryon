"""
backend/routers/memory.py — Long-term memory management.

GET  /api/memory               — list all stored facts
DELETE /api/memory/{id}        — forget a fact
PATCH  /api/memory/{id}        — edit a fact
GET  /api/memory/count         — how many facts stored (for Starter cap UI)
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.auth import get_current_user
from backend.deps import require_active_plan, get_tier_rank
from db import get_connection
from db.memory import (
    count_user_memory,
    delete_memory_fact,
    get_user_memory,
    save_user_memory,
)

router = APIRouter(tags=["memory"])

STARTER_MEMORY_CAP = 100


class MemoryPatchReq(BaseModel):
    fact: str
    category: str = "general"


@router.get("/api/memory")
async def list_memory(
    category: str = "",
    user: dict = Depends(require_active_plan),
):
    uid = user["user_id"]
    facts = get_user_memory(uid, category=category or None)
    count = len(facts)
    return {"facts": facts, "count": count, "cap": STARTER_MEMORY_CAP}


@router.get("/api/memory/count")
async def memory_count(user: dict = Depends(require_active_plan)):
    count = count_user_memory(user["user_id"])
    return {"count": count, "cap": STARTER_MEMORY_CAP}


@router.delete("/api/memory/{memory_id}")
async def forget_fact(memory_id: str, user: dict = Depends(require_active_plan)):
    ok = delete_memory_fact(user["user_id"], memory_id)
    if not ok:
        raise HTTPException(404, "Memory fact not found")
    return {"deleted": True}


@router.patch("/api/memory/{memory_id}")
async def edit_fact(
    memory_id: str,
    body: MemoryPatchReq,
    user: dict = Depends(require_active_plan),
):
    uid = user["user_id"]
    fact = body.fact.strip()
    if not fact:
        raise HTTPException(400, "Fact cannot be empty")
    try:
        conn = get_connection()
        conn.execute(
            "UPDATE user_memory SET fact=?, category=? WHERE id=? AND user_id=?",
            (fact, body.category, memory_id, uid),
        )
        conn.commit()
        conn.close()
    except Exception as exc:
        raise HTTPException(500, str(exc))
    return {"updated": True}
