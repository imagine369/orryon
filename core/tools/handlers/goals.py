"""Tool handlers — goals."""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timedelta, timezone

from db import (
    delete_row, fetch_rows, get_connection, insert_row, update_row, get_balance, adjust_balance, update_balance, get_or_create_balance_account
)
from core.tools.shared import (
    _now_iso,
    _uid
)

logger = logging.getLogger(__name__)


def _delete_goal(args: dict, user_id: str) -> dict:
    """Delete a goal by id or fuzzy-matched name."""
    goal_id = args.get("goal_id") or args.get("id")
    name_hint = (args.get("name") or args.get("goal_name") or "").strip().lower()

    conn = get_connection()
    if goal_id:
        row = conn.execute(
            "SELECT id, name FROM goals WHERE id=? AND user_id=?",
            (goal_id, user_id),
        ).fetchone()
        matches = [row] if row else []
    elif name_hint:
        all_rows = conn.execute(
            "SELECT id, name FROM goals WHERE user_id=?",
            (user_id,),
        ).fetchall()
        matches = [r for r in all_rows if name_hint in r["name"].lower()]
    else:
        conn.close()
        return {"status": "error", "message": "Provide goal_id or name."}
    conn.close()

    if not matches:
        return {"status": "not_found", "message": "Goal not found."}
    if len(matches) > 1:
        return {
            "status": "ambiguous",
            "message": f"Multiple goals match '{name_hint}'. Ask the user which one.",
            "candidates": [{"id": r["id"], "name": r["name"]} for r in matches],
        }
    target = matches[0]
    delete_row("goals", {"id": target["id"], "user_id": user_id})
    return {"status": "ok", "deleted": target["name"], "id": target["id"]}
def _add_goal(args: dict, user_id: str) -> dict:
    row = {
        "id": _uid(),
        "user_id": user_id,
        "name": args["name"],
        "target_amount": float(args["target_amount"]),
        "current_amount": float(args.get("current_amount", 0)),
        "target_date": args.get("target_date", ""),
        "category": args.get("category", "other"),
        "linked_budget_category": args.get("linked_budget_category", ""),
        "notes": args.get("notes", ""),
        "created_at": _now_iso(),
        "is_completed": 0,
    }
    insert_row("goals", row)
    pct = round((row["current_amount"] / row["target_amount"]) * 100, 1) if row["target_amount"] else 0
    remaining = round(row["target_amount"] - row["current_amount"], 2)
    # Days to target
    days_left = None
    if row["target_date"]:
        try:
            td = datetime.strptime(row["target_date"], "%Y-%m-%d") - datetime.now()
            days_left = max(0, td.days)
        except Exception:
            pass
    return {
        "status": "ok",
        "id": row["id"],
        "name": row["name"],
        "target_amount": row["target_amount"],
        "current_amount": row["current_amount"],
        "pct_complete": pct,
        "remaining": remaining,
        "target_date": row["target_date"],
        "days_left": days_left,
    }
def _update_goal_progress(args: dict, user_id: str) -> dict:
    # Accept both canonical and legacy arg names.
    raw_name = args.get("name") or args.get("goal_name") or ""
    if not raw_name:
        return {"status": "error", "message": "Goal name is required."}
    goal_name = str(raw_name).lower()
    raw_amount = args.get("progress_amount")
    if raw_amount is None:
        raw_amount = args.get("amount", 0)
    amount = float(raw_amount or 0)
    action = args.get("action", "add")

    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM goals WHERE user_id=? AND is_completed=0",
        (user_id,),
    ).fetchall()
    conn.close()

    matched = next((r for r in rows if goal_name in r["name"].lower()), None)
    if not matched:
        return {"status": "not_found", "searched": raw_name}

    if action == "set":
        new_amount = amount
    elif action == "subtract":
        new_amount = float(matched["current_amount"]) - amount
    else:
        new_amount = float(matched["current_amount"]) + amount

    new_amount = max(0, new_amount)
    target = float(matched["target_amount"])
    is_completed = 1 if new_amount >= target else 0
    new_amount = min(new_amount, target)

    updates: dict = {"current_amount": new_amount, "is_completed": is_completed}
    if args.get("target_amount") is not None:
        try:
            updates["target_amount"] = float(args["target_amount"])
        except (TypeError, ValueError):
            pass
    if args.get("deadline"):
        updates["target_date"] = str(args["deadline"])
    update_row("goals", updates, {"id": matched["id"]})

    pct = round((new_amount / target) * 100, 1) if target else 0
    remaining = round(target - new_amount, 2)
    return {
        "status": "ok",
        "name": matched["name"],
        "current_amount": round(new_amount, 2),
        "target_amount": target,
        "pct_complete": pct,
        "remaining": remaining,
        "is_completed": bool(is_completed),
        "added": round(amount, 2) if action == "add" else None,
    }
def _get_goals(args: dict, user_id: str) -> dict:
    goal_name = (args.get("goal_name") or "").lower()
    include_completed = args.get("include_completed", False)

    conn = get_connection()
    if include_completed:
        rows = conn.execute(
            "SELECT * FROM goals WHERE user_id=? ORDER BY created_at DESC",
            (user_id,),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM goals WHERE user_id=? AND is_completed=0 ORDER BY created_at DESC",
            (user_id,),
        ).fetchall()
    conn.close()

    if goal_name:
        rows = [r for r in rows if goal_name in r["name"].lower()]

    goals = []
    for r in rows:
        target = float(r["target_amount"])
        current = float(r["current_amount"])
        pct = round((current / target) * 100, 1) if target else 0
        days_left = None
        if r["target_date"]:
            try:
                td = datetime.strptime(r["target_date"], "%Y-%m-%d") - datetime.now()
                days_left = max(0, td.days)
            except Exception:
                pass
        goals.append({
            "name": r["name"],
            "target_amount": target,
            "current_amount": round(current, 2),
            "remaining": round(target - current, 2),
            "pct_complete": pct,
            "target_date": r["target_date"] or "",
            "category": r["category"],
            "days_left": days_left,
            "is_completed": bool(r["is_completed"]),
            "notes": r["notes"] or "",
        })

    return {"status": "ok", "goals": goals, "count": len(goals)}
