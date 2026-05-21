"""Tool handler implementations."""
from __future__ import annotations

import json
import logging
import re
import uuid
from datetime import datetime, timedelta, timezone
from difflib import get_close_matches

try:
    import dateparser as _dateparser
except Exception:
    _dateparser = None

from db import (
    delete_row, fetch_rows, get_connection, insert_row, update_row,
    get_balance, adjust_balance, update_balance, get_or_create_balance_account,
)

logger = logging.getLogger(__name__)

def _today() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def _current_month() -> str:
    return datetime.now().strftime("%Y-%m")


def _get_cycle_day(user_id: str) -> int:
    """Return the user's budget_cycle_start day (1-28), defaulting to 1."""
    conn = get_connection()
    row = conn.execute(
        "SELECT budget_cycle_start FROM users WHERE id=?", (user_id,)
    ).fetchone()
    conn.close()
    if row:
        val = row["budget_cycle_start"] if isinstance(row, dict) else row[0]
        if val and 1 <= int(val) <= 28:
            return int(val)
    return 1


def _cycle_boundaries(user_id: str, ref: datetime | None = None) -> tuple[str, str]:
    """Return (start_date, end_date) for the user's current budget cycle.

    If cycle_day == 1 this is identical to calendar month boundaries.
    If cycle_day == 15, the cycle runs from the 15th of one month to the 14th
    of the next.
    """
    ref = ref or datetime.now()
    day = _get_cycle_day(user_id)
    if ref.day >= day:
        start = ref.replace(day=day)
    else:
        prev = ref.replace(day=1) - timedelta(days=1)
        start = prev.replace(day=min(day, prev.day))
    next_month = (start + timedelta(days=32)).replace(day=1)
    end = next_month.replace(day=min(day, 28)) - timedelta(days=1)
    return start.strftime("%Y-%m-%d"), min(end, ref).strftime("%Y-%m-%d")


def _cycle_month_key(user_id: str, ref: datetime | None = None) -> str:
    """Return a YYYY-MM key representing the budget cycle that contains *ref*.

    Uses the cycle start date's month so budget_categories rows line up."""
    start_str, _ = _cycle_boundaries(user_id, ref)
    return start_str[:7]


def _prev_cycle_boundaries(user_id: str, ref: datetime | None = None) -> tuple[str, str]:
    """Return (start_date, end_date) for the previous budget cycle."""
    ref = ref or datetime.now()
    cur_start_str, _ = _cycle_boundaries(user_id, ref)
    cur_start = datetime.strptime(cur_start_str, "%Y-%m-%d")
    prev_ref = cur_start - timedelta(days=1)
    return _cycle_boundaries(user_id, prev_ref)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _uid() -> str:
    return str(uuid.uuid4())


# ── Write tools ───────────────────────────────────────────────────────────────

def _get_goal_impact_for_category(user_id: str, category: str, month: str) -> dict | None:
    """Return goal impact data if any active goal is linked to this expense category."""
    conn = get_connection()
    goals = conn.execute(
        "SELECT * FROM goals WHERE user_id=? AND is_completed=0 AND linked_budget_category=?",
        (user_id, category),
    ).fetchall()
    conn.close()
    if not goals:
        return None
    g = dict(goals[0])
    target = float(g["target_amount"])
    current = float(g["current_amount"])
    remaining = round(target - current, 2)
    pct = round((current / target * 100), 1) if target else 0
    monthly_needed = None
    months_left = None
    if g.get("target_date"):
        try:
            target_dt = datetime.strptime(g["target_date"], "%Y-%m-%d")
            months_left = max(1, round((target_dt - datetime.now()).days / 30))
            monthly_needed = round(remaining / months_left, 2)
        except Exception:
            pass
    return {
        "goal_name": g["name"],
        "pct_complete": pct,
        "remaining": round(remaining, 2),
        "monthly_needed": monthly_needed,
        "months_left": months_left,
        "target_date": g.get("target_date", ""),
    }


def _add_expense(args: dict, user_id: str) -> dict:
    date = args.get("date") or _today()
    import json as _json
    merchant = args.get("merchant") or args.get("description") or "Unknown"
    description = args.get("description") or args.get("merchant") or ""
    row = {
        "id": _uid(),
        "user_id": user_id,
        "date": date,
        "amount": float(args["amount"]),
        "merchant": merchant,
        "description": description,
        "category": args.get("category", "Other"),
        "is_recurring": 0,
        "metadata": _json.dumps({"notes": args.get("notes", "")}),
    }
    insert_row("transactions", row)
    new_bal = adjust_balance(user_id, -row["amount"])
    category = args.get("category", "Other")
    cycle_month = _cycle_month_key(user_id)
    _ensure_budget_for_cycle(user_id, cycle_month)
    spent = _get_category_spending_cycle(user_id, category)
    budget = _get_category_budget(user_id, category, cycle_month)
    goal_impact = _get_goal_impact_for_category(user_id, category, cycle_month)

    alert = _check_spending_alert(user_id, category, spent, budget)

    result: dict = {
        "status": "ok",
        "id": row["id"],
        "amount": row["amount"],
        "merchant": row["merchant"],
        "category": row["category"],
        "date": date,
        "month_spent": spent,
        "month_budget": budget,
        "new_balance": round(new_bal, 2),
        "goal_impact": goal_impact,
    }
    if alert:
        result["spending_alert"] = alert
    return result


def _add_calendar_event(args: dict, user_id: str) -> dict:
    title = args["title"]
    start = args.get("start")
    if start:
        s = str(start).replace("T", " ")
        date, _, time = s.partition(" ")
        time = (time or "").strip()[:5]  # HH:MM
    else:
        date = args.get("date") or _today()
        time = args.get("time", "") or ""
    if args.get("all_day") is True:
        time = ""
    event_datetime = f"{date} {time}".strip()
    reminder = int(args.get("reminder_minutes", 30))

    conn = get_connection()
    user_row = conn.execute(
        "SELECT default_reminder_minutes FROM users WHERE id=?", (user_id,)
    ).fetchone()
    conn.close()
    if "reminder_minutes" not in args and user_row and user_row["default_reminder_minutes"] is not None:
        reminder = int(user_row["default_reminder_minutes"])

    row = {
        "id": _uid(),
        "user_id": user_id,
        "title": title,
        "description": args.get("description", ""),
        "event_date": event_datetime,
        "event_type": args.get("event_type", "event"),
        "amount": 0,
        "is_recurring": 0,
        "reminder_minutes": reminder,
        "reminder_sent": 0,
        "created_at": _now_iso(),
    }
    insert_row("events", row)

    reminder_label = _reminder_label(reminder)
    return {
        "status": "ok", "id": row["id"], "title": title,
        "date": date, "time": time, "reminder": reminder_label,
    }


def _add_grocery_items(args: dict, user_id: str) -> dict:
    """Add items to the user's Grocery list.

    Routes through the `user_lists` / `list_items` tables that the in-app
    Lists tab actually reads from (a previous implementation wrote only to
    a legacy `grocery_items` table that no UI surfaced, so chat-added items
    appeared to vanish). We find-or-create a `user_lists` row named
    "Grocery" and append the items there. The legacy `grocery_items` table
    is kept in sync too so the marketing landing page's `/api/grocery`
    preview keeps working without redeploys.
    """
    raw_items = args.get("items", []) or []
    if not raw_items:
        return {"status": "ok", "added": [], "count_added": 0}

    now = _now_iso()

    # 1) Find-or-create the canonical "Grocery" user_list for this user.
    conn = get_connection()
    existing = conn.execute(
        "SELECT id FROM user_lists WHERE user_id=? AND LOWER(name)='grocery' "
        "ORDER BY created_at ASC LIMIT 1",
        (user_id,),
    ).fetchone()
    if existing:
        list_id = existing["id"] if isinstance(existing, dict) else existing[0]
        order_row = conn.execute(
            "SELECT COALESCE(MAX(sort_order),0) AS val FROM list_items WHERE list_id=?",
            (list_id,),
        ).fetchone()
        max_item_order = order_row["val"] if isinstance(order_row, dict) else order_row[0]
    else:
        list_order_row = conn.execute(
            "SELECT COALESCE(MAX(sort_order),0) AS val FROM user_lists WHERE user_id=?",
            (user_id,),
        ).fetchone()
        max_list_order = list_order_row["val"] if isinstance(list_order_row, dict) else list_order_row[0]
        list_id = _uid()
        insert_row("user_lists", {
            "id": list_id,
            "user_id": user_id,
            "name": "Grocery",
            "icon": "",
            "color": "#22c55e",  # green — matches the grocery / food theme in the palette
            "sort_order": max_list_order + 1,
            "created_at": now,
        })
        max_item_order = 0
    conn.close()

    # 2) Insert each item into both the user_list (UI-visible) and the
    #    legacy grocery_items table (marketing-page preview).
    items_added: list[str] = []
    total_est = 0.0
    for i, item in enumerate(raw_items):
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        price = float(item.get("estimated_price", 0) or 0)
        total_est += price

        insert_row("list_items", {
            "id": _uid(),
            "list_id": list_id,
            "user_id": user_id,
            "name": name,
            "notes": "",
            "is_checked": 0,
            "sort_order": max_item_order + 1 + i,
            "added_at": now,
        })
        insert_row("grocery_items", {
            "id": _uid(),
            "user_id": user_id,
            "name": name,
            "quantity": str(item.get("quantity", "1")),
            "estimated_price": price,
            "is_checked": 0,
            "added_at": now,
        })
        items_added.append(name)

    all_items = fetch_rows("list_items", {"list_id": list_id, "user_id": user_id, "is_checked": 0})
    return {
        "status": "ok",
        "list_id": list_id,
        "list_name": "Grocery",
        "added": items_added,
        "count_added": len(items_added),
        "total_list_count": len(all_items),
        "estimated_total_added": total_est,
    }


def _add_recurring_bill(args: dict, user_id: str) -> dict:
    name = args["name"]
    amount = float(args.get("amount", 0))
    frequency = args.get("frequency", "monthly")
    due_date_iso = args.get("due_date")  # preferred: ISO YYYY-MM-DD
    due_day = args.get("due_day")

    # Compute next due date
    now = datetime.now()
    if due_date_iso and re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(due_date_iso)):
        next_due = str(due_date_iso)
    elif due_day and frequency == "monthly":
        try:
            due_day_int = int(due_day)
            if now.day < due_day_int:
                next_due = now.replace(day=due_day_int).strftime("%Y-%m-%d")
            else:
                if now.month == 12:
                    next_due = now.replace(year=now.year + 1, month=1, day=due_day_int).strftime("%Y-%m-%d")
                else:
                    next_due = now.replace(month=now.month + 1, day=due_day_int).strftime("%Y-%m-%d")
        except Exception:
            next_due = (now + timedelta(days=30)).strftime("%Y-%m-%d")
    else:
        next_due = (now + timedelta(days=30)).strftime("%Y-%m-%d")

    row = {
        "id": _uid(),
        "user_id": user_id,
        "name": name,
        "amount": amount,
        "frequency": frequency,
        "next_due": next_due,
        "category": args.get("category", "Utilities"),
        "is_active": 1,
        "detected_at": _now_iso(),
    }
    insert_row("subscriptions", row)
    return {"status": "ok", "id": row["id"], "name": name, "amount": amount, "next_due": next_due}


def _add_task(args: dict, user_id: str) -> dict:
    row = {
        "id": _uid(),
        "user_id": user_id,
        "title": args["title"],
        "description": args.get("description", ""),
        "priority": args.get("priority", "medium"),
        "status": "open",
        "due_date": args.get("due_date", ""),
        "category": args.get("category", "personal"),
        "created_by": "orryon",
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    insert_row("action_items", row)
    return {"status": "ok", "id": row["id"], "title": row["title"], "due_date": row["due_date"]}


def _add_note(args: dict, user_id: str) -> dict:
    now_iso = _now_iso()
    row = {
        "id": _uid(),
        "user_id": user_id,
        "title": args["title"],
        "content": args["content"],
        "tags": args.get("tags", ""),
        "mood": args.get("mood", ""),
        "is_pinned": 1 if args.get("is_pinned") else 0,
        "linked_goal": args.get("linked_goal", ""),
        "linked_account": "",
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    insert_row("notes", row)
    return {"status": "ok", "id": row["id"], "title": row["title"]}


def _search_notes(args: dict, user_id: str) -> dict:
    query = args.get("query", "").lower()
    tag = args.get("tag", "").lower()
    mood_filter = args.get("mood", "")
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM notes WHERE user_id=? ORDER BY is_pinned DESC, updated_at DESC",
        (user_id,),
    ).fetchall()
    conn.close()
    results = []
    for r in [dict(r) for r in rows]:
        if query:
            searchable = f"{r.get('title','')} {r.get('content','')} {r.get('tags','')}".lower()
            if query not in searchable:
                continue
        if tag and tag not in (r.get("tags") or "").lower():
            continue
        if mood_filter and r.get("mood") != mood_filter:
            continue
        preview = (r.get("content") or "")[:200]
        results.append({
            "id": r["id"], "title": r["title"], "preview": preview,
            "tags": r.get("tags", ""), "mood": r.get("mood", ""),
            "is_pinned": bool(r.get("is_pinned")),
            "linked_goal": r.get("linked_goal", ""),
            "updated_at": r.get("updated_at", ""),
        })
    return {"status": "ok", "count": len(results), "notes": results[:20]}


def _edit_note(args: dict, user_id: str) -> dict:
    nid = args["note_id"]
    conn = get_connection()
    row = conn.execute("SELECT * FROM notes WHERE id=? AND user_id=?", (nid, user_id)).fetchone()
    conn.close()
    if not row:
        return {"status": "not_found", "message": "Note not found."}
    updates = {"updated_at": _now_iso()}
    for field in ("title", "content", "tags", "mood", "linked_goal"):
        if field in args:
            updates[field] = args[field]
    if "is_pinned" in args:
        updates["is_pinned"] = 1 if args["is_pinned"] else 0
    update_row("notes", updates, {"id": nid})
    return {"status": "ok", "id": nid, "updated": list(updates.keys())}


def _pin_note(args: dict, user_id: str) -> dict:
    nid = args["note_id"]
    pin = 1 if args.get("pin", True) else 0
    conn = get_connection()
    row = conn.execute("SELECT id, title, is_pinned FROM notes WHERE id=? AND user_id=?", (nid, user_id)).fetchone()
    conn.close()
    if not row:
        return {"status": "not_found", "message": "Note not found."}
    update_row("notes", {"is_pinned": pin, "updated_at": _now_iso()}, {"id": nid})
    action = "pinned" if pin else "unpinned"
    return {"status": "ok", "action": action, "title": row["title"]}


# ── Full-CRUD additions (edit_bill, delete_goal, journal edit/delete, delete_list) ──

def _edit_bill(args: dict, user_id: str) -> dict:
    """Edit an existing recurring bill / subscription."""
    bill_id = args.get("bill_id") or args.get("id")
    if not bill_id:
        return {"status": "error", "message": "bill_id is required."}
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM subscriptions WHERE id=? AND user_id=?",
        (bill_id, user_id),
    ).fetchone()
    conn.close()
    if not row:
        return {"status": "not_found", "message": "Bill not found."}

    updates: dict = {}
    for k in ("name", "category", "frequency"):
        if args.get(k) is not None:
            updates[k] = args[k]
    if args.get("amount") is not None:
        try:
            updates["amount"] = float(args["amount"])
        except (TypeError, ValueError):
            pass
    if args.get("due_date"):
        updates["next_due"] = str(args["due_date"])
    if args.get("is_active") is not None:
        updates["is_active"] = 1 if args["is_active"] else 0

    if not updates:
        return {"status": "no_changes", "message": "Nothing to update."}
    update_row("subscriptions", updates, {"id": bill_id, "user_id": user_id})
    return {
        "status": "ok",
        "id": bill_id,
        "name": row["name"],
        "updated_fields": sorted(updates.keys()),
    }


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


def _edit_journal_entry(args: dict, user_id: str) -> dict:
    """Edit an existing journal entry (a notes row with is_journal=1)."""
    entry_id = args.get("entry_id") or args.get("note_id") or args.get("id")
    if not entry_id:
        return {"status": "error", "message": "entry_id is required."}
    conn = get_connection()
    row = conn.execute(
        "SELECT id, is_journal FROM notes WHERE id=? AND user_id=?",
        (entry_id, user_id),
    ).fetchone()
    conn.close()
    if not row:
        return {"status": "not_found", "message": "Journal entry not found."}
    d = dict(row) if not isinstance(row, dict) else row
    if not d.get("is_journal"):
        return {"status": "wrong_kind", "message": "That's a plain note — use edit_note."}
    # Delegate to _edit_note using its expected arg shape.
    delegated = {**args, "note_id": entry_id}
    result = _edit_note(delegated, user_id)
    if result.get("status") == "ok":
        result["kind"] = "journal"
    return result


def _delete_journal_entry(args: dict, user_id: str) -> dict:
    """Delete a journal entry (notes row with is_journal=1)."""
    entry_id = args.get("entry_id") or args.get("note_id") or args.get("id")
    if not entry_id:
        return {"status": "error", "message": "entry_id is required."}
    conn = get_connection()
    row = conn.execute(
        "SELECT id, title, is_journal FROM notes WHERE id=? AND user_id=?",
        (entry_id, user_id),
    ).fetchone()
    conn.close()
    if not row:
        return {"status": "not_found", "message": "Journal entry not found."}
    d = dict(row) if not isinstance(row, dict) else row
    if not d.get("is_journal"):
        return {"status": "wrong_kind", "message": "That's a plain note — use delete_note."}
    delete_row("notes", {"id": entry_id, "user_id": user_id})
    return {"status": "ok", "deleted": d.get("title") or "journal entry", "id": entry_id}


def _delete_list(args: dict, user_id: str) -> dict:
    """Delete a user list and all its items."""
    list_id = args.get("list_id") or args.get("id")
    if not list_id:
        return {"status": "error", "message": "list_id is required."}
    conn = get_connection()
    row = conn.execute(
        "SELECT id, name FROM user_lists WHERE id=? AND user_id=?",
        (list_id, user_id),
    ).fetchone()
    if not row:
        conn.close()
        return {"status": "not_found", "message": "List not found."}
    item_count_row = conn.execute(
        "SELECT COUNT(*) AS c FROM list_items WHERE list_id=? AND user_id=?",
        (list_id, user_id),
    ).fetchone()
    item_count = item_count_row["c"] if isinstance(item_count_row, dict) else item_count_row[0]
    conn.close()
    delete_row("list_items", {"list_id": list_id, "user_id": user_id})
    delete_row("user_lists", {"id": list_id, "user_id": user_id})
    name = row["name"] if not isinstance(row, dict) else row.get("name")
    return {"status": "ok", "deleted": name, "id": list_id, "items_removed": item_count}


def _set_budget(args: dict, user_id: str) -> dict:
    month = args.get("month") or _cycle_month_key(user_id)
    category = args["category"]
    amount = float(args["amount"])
    rollover = 1 if args.get("rollover") else 0
    now_ts = _now_iso()
    conn = get_connection()
    existing = conn.execute(
        "SELECT id FROM budget_categories WHERE user_id=? AND category=? AND month=?",
        (user_id, category, month),
    ).fetchone()
    conn.close()
    if existing:
        update_row("budget_categories", {"planned": amount, "rollover": rollover}, {"id": existing["id"]})
    else:
        insert_row("budget_categories", {
            "id": _uid(),
            "user_id": user_id,
            "category": category,
            "planned": amount,
            "month": month,
            "rollover": rollover,
            "created_at": now_ts,
        })

    _upsert_budget_template(user_id, category, amount, rollover)

    spent = _get_category_spending_cycle(user_id, category)
    return {"status": "ok", "category": category, "planned": amount, "spent": spent, "month": month, "rollover": bool(rollover)}


def _upsert_budget_template(user_id: str, category: str, planned: float, rollover: int = 0) -> None:
    """Persist the budget category as a reusable template ("set once, carry forever")."""
    conn = get_connection()
    existing = conn.execute(
        "SELECT id FROM budget_templates WHERE user_id=? AND category=?",
        (user_id, category),
    ).fetchone()
    conn.close()
    now_ts = _now_iso()
    if existing:
        eid = existing["id"] if isinstance(existing, dict) else existing[0]
        update_row("budget_templates", {"planned": planned, "rollover": rollover, "updated_at": now_ts}, {"id": eid})
    else:
        insert_row("budget_templates", {
            "id": _uid(), "user_id": user_id, "category": category,
            "planned": planned, "rollover": rollover,
            "created_at": now_ts, "updated_at": now_ts,
        })


def _ensure_budget_for_cycle(user_id: str, month_key: str) -> None:
    """Auto-carry budget templates into a new cycle month if no rows exist yet."""
    conn = get_connection()
    existing = conn.execute(
        "SELECT COUNT(*) as cnt FROM budget_categories WHERE user_id=? AND month=?",
        (user_id, month_key),
    ).fetchone()
    cnt = existing["cnt"] if isinstance(existing, dict) else existing[0]
    if cnt > 0:
        conn.close()
        return
    templates = conn.execute(
        "SELECT category, planned, rollover FROM budget_templates WHERE user_id=?",
        (user_id,),
    ).fetchall()
    conn.close()
    now_ts = _now_iso()
    for t in templates:
        cat = t["category"] if isinstance(t, dict) else t[0]
        planned = t["planned"] if isinstance(t, dict) else t[1]
        roll = t["rollover"] if isinstance(t, dict) else t[2]
        insert_row("budget_categories", {
            "id": _uid(), "user_id": user_id, "category": cat,
            "planned": float(planned), "month": month_key,
            "rollover": int(roll), "created_at": now_ts,
        })


def _check_grocery_item(args: dict, user_id: str) -> dict:
    """Mark a grocery item as checked. Reads the canonical "Grocery"
    user_list first (what the UI shows); falls back to the legacy
    grocery_items table if nothing matches there."""
    name = args["item_name"].lower()
    conn = get_connection()
    try:
        glist = conn.execute(
            "SELECT id FROM user_lists WHERE user_id=? AND LOWER(name)='grocery' "
            "ORDER BY created_at ASC LIMIT 1",
            (user_id,),
        ).fetchone()
        if glist:
            list_id = glist["id"] if isinstance(glist, dict) else glist[0]
            rows = conn.execute(
                "SELECT id, name FROM list_items "
                "WHERE list_id=? AND user_id=? AND is_checked=0",
                (list_id, user_id),
            ).fetchall()
            matched = next((r for r in rows if name in r["name"].lower()), None)
            if matched:
                conn.close()
                update_row("list_items", {"is_checked": 1}, {"id": matched["id"]})
                return {"status": "ok", "checked": matched["name"]}
        # Legacy fallback for pre-migration items.
        legacy_rows = conn.execute(
            "SELECT id, name FROM grocery_items WHERE user_id=? AND is_checked=0",
            (user_id,),
        ).fetchall()
    finally:
        conn.close()
    matched = next((r for r in legacy_rows if name in r["name"].lower()), None)
    if matched:
        update_row("grocery_items", {"is_checked": 1}, {"id": matched["id"]})
        return {"status": "ok", "checked": matched["name"]}
    return {"status": "not_found", "searched": args["item_name"]}


def _get_grocery_list(args: dict, user_id: str) -> dict:
    """Return the unchecked grocery items as the user sees them in the Lists
    tab. Prefers the "Grocery" user_list; falls back to the legacy table."""
    conn = get_connection()
    try:
        glist = conn.execute(
            "SELECT id FROM user_lists WHERE user_id=? AND LOWER(name)='grocery' "
            "ORDER BY created_at ASC LIMIT 1",
            (user_id,),
        ).fetchone()
        if glist:
            list_id = glist["id"] if isinstance(glist, dict) else glist[0]
            rows = conn.execute(
                "SELECT name FROM list_items "
                "WHERE list_id=? AND user_id=? AND is_checked=0 "
                "ORDER BY sort_order ASC",
                (list_id, user_id),
            ).fetchall()
            names = [r["name"] if isinstance(r, dict) else r[0] for r in rows]
            if names:
                return {"status": "ok", "items": names, "count": len(names)}
    finally:
        conn.close()
    items = fetch_rows("grocery_items", {"user_id": user_id, "is_checked": 0})
    names = [i["name"] for i in items]
    return {"status": "ok", "items": names, "count": len(names)}


def _complete_task(args: dict, user_id: str) -> dict:
    title = args["task_title"].lower()
    conn = get_connection()
    rows = conn.execute(
        "SELECT id, title FROM action_items WHERE user_id=? AND status='open'",
        (user_id,),
    ).fetchall()
    conn.close()
    matched = next((r for r in rows if title in r["title"].lower()), None)
    if matched:
        update_row("action_items", {"status": "done", "updated_at": _now_iso()}, {"id": matched["id"]})
        return {"status": "ok", "completed": matched["title"]}
    return {"status": "not_found", "searched": args["task_title"]}


# ── Balance tools ─────────────────────────────────────────────────────────────

def _set_balance(args: dict, user_id: str) -> dict:
    amount = float(args["amount"])
    update_balance(user_id, amount)
    return {
        "status": "ok",
        "balance": round(amount, 2),
    }


def _add_money(args: dict, user_id: str) -> dict:
    amount = float(args["amount"])
    date = args.get("date") or _today()
    description = args.get("description", "Income")
    import json as _json

    row = {
        "id": _uid(),
        "user_id": user_id,
        "date": date,
        "amount": -amount,  # negative = income
        "merchant": description,
        "description": description,
        "category": "Income",
        "is_recurring": 0,
        "metadata": _json.dumps({"type": "deposit"}),
    }
    insert_row("transactions", row)

    new_bal = adjust_balance(user_id, amount)
    return {
        "status": "ok",
        "id": row["id"],
        "amount_added": round(amount, 2),
        "description": description,
        "date": date,
        "new_balance": round(new_bal, 2),
    }


def _get_balance(args: dict, user_id: str) -> dict:
    bal = get_balance(user_id)
    conn = get_connection()
    goals = conn.execute(
        "SELECT SUM(current_amount) as total FROM goals WHERE user_id=? AND is_completed=0",
        (user_id,),
    ).fetchone()
    bills = conn.execute(
        "SELECT SUM(amount) as total FROM subscriptions "
        "WHERE user_id=? AND is_active=1 AND frequency='monthly'",
        (user_id,),
    ).fetchone()
    conn.close()
    goals_total = float(goals["total"] or 0) if goals else 0
    bills_total = float(bills["total"] or 0) if bills else 0
    free_to_spend = round(bal - goals_total, 2)
    return {
        "balance": round(bal, 2),
        "goals_earmarked": round(goals_total, 2),
        "monthly_bills": round(bills_total, 2),
        "free_to_spend": free_to_spend,
    }


# ── Read tools ────────────────────────────────────────────────────────────────

def _get_spending_summary(args: dict, user_id: str) -> dict:
    period = args.get("period", "this_month")
    category_filter = args.get("category", "")
    now = datetime.now()

    if period == "today":
        start = now.strftime("%Y-%m-%d")
        end = start
    elif period == "this_week":
        start = (now - timedelta(days=now.weekday())).strftime("%Y-%m-%d")
        end = now.strftime("%Y-%m-%d")
    elif period == "this_month":
        start, end = _cycle_boundaries(user_id)
    elif period == "last_month":
        start, end = _prev_cycle_boundaries(user_id)
    elif period == "last_7_days":
        start = (now - timedelta(days=7)).strftime("%Y-%m-%d")
        end = now.strftime("%Y-%m-%d")
    else:  # last_30_days
        start = (now - timedelta(days=30)).strftime("%Y-%m-%d")
        end = now.strftime("%Y-%m-%d")

    conn = get_connection()
    if category_filter:
        rows = conn.execute(
            "SELECT * FROM transactions WHERE user_id=? AND date>=? AND date<=? AND category=? AND amount>0",
            (user_id, start, end, category_filter),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM transactions WHERE user_id=? AND date>=? AND date<=? AND amount>0",
            (user_id, start, end),
        ).fetchall()
    conn.close()

    total = sum(r["amount"] for r in rows)
    by_category: dict[str, float] = {}
    for r in rows:
        cat = r["category"] or "Other"
        by_category[cat] = by_category.get(cat, 0) + r["amount"]

    breakdown = sorted(
        [{"category": k, "total": round(v, 2)} for k, v in by_category.items()],
        key=lambda x: x["total"], reverse=True
    )
    return {
        "period": period,
        "start": start,
        "end": end,
        "total": round(total, 2),
        "transaction_count": len(rows),
        "by_category": breakdown,
        "category_filter": category_filter or "all",
    }


def _get_net_worth(args: dict, user_id: str) -> dict:
    bal = get_balance(user_id)
    conn = get_connection()
    goals = conn.execute(
        "SELECT SUM(current_amount) as total FROM goals WHERE user_id=? AND is_completed=0",
        (user_id,),
    ).fetchone()
    conn.close()
    goals_total = float(goals["total"] or 0) if goals else 0
    return {
        "net_worth": round(bal, 2),
        "balance": round(bal, 2),
        "goals_earmarked": round(goals_total, 2),
        "balance_after_goals": round(bal - goals_total, 2),
    }


def _get_upcoming_schedule(args: dict, user_id: str) -> dict:
    days = int(args.get("days", 14))
    now = datetime.now()
    end_date = (now + timedelta(days=days)).strftime("%Y-%m-%d")
    today = now.strftime("%Y-%m-%d")

    conn = get_connection()
    events = conn.execute(
        "SELECT * FROM events WHERE user_id=? AND event_date>=? ORDER BY event_date ASC LIMIT 20",
        (user_id, today),
    ).fetchall()
    tasks = conn.execute(
        "SELECT * FROM action_items WHERE user_id=? AND status='open' ORDER BY due_date ASC LIMIT 10",
        (user_id,),
    ).fetchall()
    bills = conn.execute(
        "SELECT * FROM subscriptions WHERE user_id=? AND is_active=1 AND next_due>=? AND next_due<=? ORDER BY next_due ASC",
        (user_id, today, end_date),
    ).fetchall()
    conn.close()

    items = []
    for e in events:
        items.append({
            "type": "event",
            "title": e["title"],
            "date": e["event_date"][:10] if e["event_date"] else "",
            "time": e["event_date"][11:16] if len(e["event_date"] or "") > 10 else "",
        })
    for t in tasks:
        items.append({
            "type": "task",
            "title": t["title"],
            "date": t["due_date"] or "",
            "priority": t["priority"],
        })
    for b in bills:
        items.append({
            "type": "bill",
            "title": b["name"],
            "date": b["next_due"],
            "amount": b["amount"],
        })

    items.sort(key=lambda x: x.get("date") or "9999")
    return {"status": "ok", "days_ahead": days, "items": items, "count": len(items)}


def _get_budget_status(args: dict, user_id: str) -> dict:
    month = args.get("month") or _cycle_month_key(user_id)
    category_filter = args.get("category", "")

    _ensure_budget_for_cycle(user_id, month)

    conn = get_connection()
    if category_filter:
        budgets = conn.execute(
            "SELECT * FROM budget_categories WHERE user_id=? AND month=? AND category=?",
            (user_id, month, category_filter),
        ).fetchall()
    else:
        budgets = conn.execute(
            "SELECT * FROM budget_categories WHERE user_id=? AND month=?",
            (user_id, month),
        ).fetchall()

    start, end = _cycle_boundaries(user_id)
    txns = conn.execute(
        "SELECT category, SUM(amount) as total FROM transactions "
        "WHERE user_id=? AND date>=? AND date<=? AND amount>0 GROUP BY category",
        (user_id, start, end),
    ).fetchall()
    conn.close()

    spent_map = {r["category"]: round(r["total"], 2) for r in txns}
    result = []
    for b in budgets:
        cat = b["category"]
        spent = spent_map.get(cat, 0)
        planned = b["planned"]
        pct = round((spent / planned * 100) if planned else 0, 1)
        result.append({
            "category": cat,
            "planned": planned,
            "spent": spent,
            "remaining": round(planned - spent, 2),
            "pct_used": pct,
        })
    result.sort(key=lambda x: x["pct_used"], reverse=True)
    return {"month": month, "categories": result}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _reminder_label(minutes: int) -> str:
    """Human-readable label for a reminder_minutes value."""
    if minutes <= 0:
        return "none"
    if minutes < 60:
        return f"{minutes} min before"
    if minutes < 1440:
        return f"{minutes // 60} hour{'s' if minutes >= 120 else ''} before"
    return "1 day before"


def _get_category_spending(user_id: str, category: str, month: str) -> float:
    conn = get_connection()
    row = conn.execute(
        "SELECT SUM(amount) as total FROM transactions "
        "WHERE user_id=? AND category=? AND date LIKE ? AND amount>0",
        (user_id, category, f"{month}%"),
    ).fetchone()
    conn.close()
    return round(float(row["total"] or 0), 2)


def _get_category_spending_cycle(user_id: str, category: str, ref: datetime | None = None) -> float:
    """Spending in a category within the user's current budget cycle."""
    start, end = _cycle_boundaries(user_id, ref)
    conn = get_connection()
    row = conn.execute(
        "SELECT COALESCE(SUM(amount),0) as total FROM transactions "
        "WHERE user_id=? AND category=? AND date>=? AND date<=? AND amount>0",
        (user_id, category, start, end),
    ).fetchone()
    conn.close()
    return round(float(row["total"] or 0), 2)


def _get_category_budget(user_id: str, category: str, month: str) -> float:
    conn = get_connection()
    row = conn.execute(
        "SELECT planned FROM budget_categories WHERE user_id=? AND category=? AND month=?",
        (user_id, category, month),
    ).fetchone()
    conn.close()
    return float(row["planned"]) if row else 0.0


def _check_spending_alert(user_id: str, category: str, spent: float, budget: float) -> dict | None:
    """Return an alert dict if category spending has crossed the user's threshold."""
    if budget <= 0:
        return None
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT spending_alert_pct FROM users WHERE id=?", (user_id,)
        ).fetchone()
    except Exception:
        row = None
    conn.close()
    threshold_pct = 80
    if row:
        val = row["spending_alert_pct"] if isinstance(row, dict) else row[0]
        if val is not None:
            threshold_pct = int(val)
    pct_used = round(spent / budget * 100, 1)
    if pct_used >= 100:
        return {
            "level": "over_budget",
            "message": f"You've exceeded your {category} budget — ${spent:,.0f} of ${budget:,.0f} ({pct_used:.0f}%).",
            "category": category, "spent": spent, "budget": budget, "pct_used": pct_used,
        }
    if pct_used >= threshold_pct:
        return {
            "level": "warning",
            "message": f"Heads up — you've used {pct_used:.0f}% of your {category} budget (${spent:,.0f} of ${budget:,.0f}).",
            "category": category, "spent": spent, "budget": budget, "pct_used": pct_used,
        }
    return None


# ── Goal tools ────────────────────────────────────────────────────────────────

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


# ── Spending Recap ────────────────────────────────────────────────────────────

def _get_spending_recap(args: dict, user_id: str) -> dict:
    period = args.get("period", "this_month")
    now = datetime.now()

    if period == "this_week":
        start = (now - timedelta(days=now.weekday())).strftime("%Y-%m-%d")
        end = now.strftime("%Y-%m-%d")
        prev_start = (now - timedelta(days=now.weekday() + 7)).strftime("%Y-%m-%d")
        prev_end = (now - timedelta(days=now.weekday() + 1)).strftime("%Y-%m-%d")
        label = "This Week"
    elif period == "last_week":
        monday = now - timedelta(days=now.weekday() + 7)
        start = monday.strftime("%Y-%m-%d")
        end = (monday + timedelta(days=6)).strftime("%Y-%m-%d")
        prev_start = (monday - timedelta(days=7)).strftime("%Y-%m-%d")
        prev_end = (monday - timedelta(days=1)).strftime("%Y-%m-%d")
        label = "Last Week"
    elif period == "last_month":
        start, end = _prev_cycle_boundaries(user_id)
        prev_start_dt = datetime.strptime(start, "%Y-%m-%d")
        ps, pe = _prev_cycle_boundaries(user_id, prev_start_dt)
        prev_start, prev_end = ps, pe
        label = "Last Month"
    else:  # this_month
        start, end = _cycle_boundaries(user_id)
        prev_start, prev_end = _prev_cycle_boundaries(user_id)
        label = "This Month"

    conn = get_connection()
    rows = conn.execute(
        "SELECT category, SUM(amount) as total, COUNT(*) as cnt "
        "FROM transactions WHERE user_id=? AND date>=? AND date<=? AND amount>0 GROUP BY category",
        (user_id, start, end),
    ).fetchall()
    prev_rows = conn.execute(
        "SELECT SUM(amount) as total FROM transactions "
        "WHERE user_id=? AND date>=? AND date<=? AND amount>0",
        (user_id, prev_start, prev_end),
    ).fetchone()
    cycle_month = _cycle_month_key(user_id)
    _ensure_budget_for_cycle(user_id, cycle_month)
    budgets = conn.execute(
        "SELECT category, planned FROM budget_categories WHERE user_id=? AND month=?",
        (user_id, cycle_month),
    ).fetchall()
    conn.close()

    total = sum(float(r["total"]) for r in rows)
    prev_total = float(prev_rows["total"] or 0) if prev_rows else 0
    by_cat = sorted([{"category": r["category"], "total": round(float(r["total"]), 2), "count": r["cnt"]} for r in rows], key=lambda x: -x["total"])
    top_cats = by_cat[:3]

    budget_map = {b["category"]: float(b["planned"]) for b in budgets}
    over_budget = [{"category": c["category"], "spent": c["total"], "budget": budget_map[c["category"]], "over_by": round(c["total"] - budget_map[c["category"]], 2)} for c in by_cat if c["category"] in budget_map and c["total"] > budget_map[c["category"]]]

    diff = round(total - prev_total, 2)
    diff_pct = round((diff / prev_total * 100) if prev_total > 0 else 0, 1)

    # Positive insight: find the category that improved most vs prior period
    insight = ""
    if total < prev_total and prev_total > 0:
        insight = f"Great job — you spent ${abs(diff):,.0f} less than the previous period ({abs(diff_pct):.0f}% reduction)! 🎉"
    elif top_cats:
        best_cat = min(by_cat, key=lambda x: x["total"]) if len(by_cat) > 1 else None
        if best_cat:
            insight = f"Your lowest spending category was {best_cat['category']} at ${best_cat['total']:,.0f} — nice restraint there!"
        else:
            insight = "Keep tracking your spending to build better habits over time!"

    return {
        "period": label,
        "start": start,
        "end": end,
        "total_spent": round(total, 2),
        "transaction_count": sum(r["cnt"] for r in rows),
        "top_categories": top_cats,
        "all_categories": by_cat,
        "prev_total": round(prev_total, 2),
        "change_vs_prev": diff,
        "change_pct": diff_pct,
        "over_budget_categories": over_budget,
        "positive_insight": insight,
    }


# ── Custom Categories ─────────────────────────────────────────────────────────

def _add_custom_category(args: dict, user_id: str) -> dict:
    name = args["name"].strip()
    icon = args.get("icon", "🏷️")
    color = args.get("color", "#6366f1")
    conn = get_connection()
    existing = conn.execute(
        "SELECT id FROM custom_categories WHERE user_id=? AND name=?",
        (user_id, name),
    ).fetchone()
    conn.close()
    if existing:
        return {"status": "already_exists", "name": name, "message": f"Category '{name}' already exists."}
    insert_row("custom_categories", {
        "id": _uid(),
        "user_id": user_id,
        "name": name,
        "color": color,
        "icon": icon,
        "is_active": 1,
        "created_at": _now_iso(),
    })
    return {"status": "ok", "name": name, "icon": icon, "color": color}


def _set_notification_preferences(args: dict, user_id: str) -> dict:
    updates = {}
    messages = []
    if "default_reminder_minutes" in args:
        val = int(args["default_reminder_minutes"])
        updates["default_reminder_minutes"] = val
        messages.append(f"Default reminder set to {_reminder_label(val)}" if val > 0 else "Default reminders turned off")
    if "daily_digest_enabled" in args:
        val = 1 if args["daily_digest_enabled"] else 0
        updates["daily_digest_enabled"] = val
        messages.append("Daily digest enabled" if val else "Daily digest disabled")
    if "daily_digest_time" in args:
        val = args["daily_digest_time"].strip()
        updates["daily_digest_time"] = val
        messages.append(f"Daily digest time set to {val}")

    if not updates:
        return {"status": "no_changes", "message": "No preferences specified."}

    update_row("users", updates, {"id": user_id})
    return {"status": "ok", "changes": messages}


# ── Delete tools (for undo) ──────────────────────────────────────────────────

def _delete_expense(args: dict, user_id: str) -> dict:
    expense_id = args["expense_id"]
    conn = get_connection()
    row = conn.execute(
        "SELECT id, merchant, amount FROM transactions WHERE id=? AND user_id=?",
        (expense_id, user_id),
    ).fetchone()
    conn.close()
    if not row:
        return {"status": "not_found", "message": "Expense not found."}
    amt = float(row["amount"])
    delete_row("transactions", {"id": expense_id, "user_id": user_id})
    if amt > 0:
        new_bal = adjust_balance(user_id, amt)  # refund expense
    elif amt < 0:
        new_bal = adjust_balance(user_id, amt)  # remove income
    else:
        new_bal = get_balance(user_id)
    return {"status": "ok", "deleted": row["merchant"], "amount": amt, "new_balance": round(new_bal, 2)}


def _delete_event(args: dict, user_id: str) -> dict:
    event_id = args["event_id"]
    conn = get_connection()
    row = conn.execute(
        "SELECT id, title FROM events WHERE id=? AND user_id=?",
        (event_id, user_id),
    ).fetchone()
    conn.close()
    if not row:
        return {"status": "not_found", "message": "Event not found."}
    delete_row("events", {"id": event_id, "user_id": user_id})
    return {"status": "ok", "deleted": row["title"]}


def _delete_task(args: dict, user_id: str) -> dict:
    task_id = args["task_id"]
    conn = get_connection()
    row = conn.execute(
        "SELECT id, title FROM action_items WHERE id=? AND user_id=?",
        (task_id, user_id),
    ).fetchone()
    conn.close()
    if not row:
        return {"status": "not_found", "message": "Task not found."}
    delete_row("action_items", {"id": task_id, "user_id": user_id})
    return {"status": "ok", "deleted": row["title"]}


def _edit_expense(args: dict, user_id: str) -> dict:
    eid = args["expense_id"]
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM transactions WHERE id=? AND user_id=?", (eid, user_id)
    ).fetchone()
    conn.close()
    if not row:
        return {"status": "not_found", "message": "Expense not found."}
    updates = {}
    if "amount" in args:
        updates["amount"] = float(args["amount"])
    if "merchant" in args:
        updates["merchant"] = args["merchant"]
        updates["description"] = args["merchant"]
    if "category" in args:
        updates["category"] = args["category"]
    if "date" in args:
        updates["date"] = args["date"]
    if not updates:
        return {"status": "no_changes", "message": "No fields to update."}
    old_amount = float(row["amount"])
    new_amount = updates.get("amount", old_amount)
    if old_amount > 0 and new_amount != old_amount:
        diff = old_amount - new_amount  # positive if amount decreased (refund), negative if increased
        adjust_balance(user_id, diff)
    update_row("transactions", updates, {"id": eid})
    new_bal = get_balance(user_id)
    return {"status": "ok", "id": eid, "updated": list(updates.keys()),
            "merchant": updates.get("merchant", row["merchant"]),
            "amount": updates.get("amount", row["amount"]),
            "new_balance": round(new_bal, 2)}


def _add_recurring_income(args: dict, user_id: str) -> dict:
    from db import get_recurring_income, get_total_monthly_income
    row = {
        "id": _uid(),
        "user_id": user_id,
        "name": args["name"],
        "amount": float(args["amount"]),
        "frequency": args.get("frequency", "monthly"),
        "source": args.get("source", ""),
        "next_date": "",
        "is_active": 1,
        "created_at": _now_iso(),
    }
    insert_row("recurring_income", row)
    total = get_total_monthly_income(user_id)
    return {"status": "ok", "id": row["id"], "name": row["name"],
            "amount": row["amount"], "frequency": row["frequency"],
            "total_monthly_income": round(total, 2)}


def _edit_event(args: dict, user_id: str) -> dict:
    eid = args["event_id"]
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM events WHERE id=? AND user_id=?", (eid, user_id)
    ).fetchone()
    conn.close()
    if not row:
        return {"status": "not_found", "message": "Event not found."}
    updates = {}
    new_date = args.get("date")
    new_time = args.get("time")
    if new_date or new_time:
        old_date_str = (row["event_date"] or "")[:10]
        old_time_str = (row["event_date"] or "")[11:16] if len(row["event_date"] or "") > 10 else ""
        d = new_date or old_date_str
        t = new_time or old_time_str
        updates["event_date"] = f"{d} {t}".strip()
    if "title" in args:
        updates["title"] = args["title"]
    if "description" in args:
        updates["description"] = args["description"]
    if not updates:
        return {"status": "no_changes"}
    update_row("events", updates, {"id": eid})
    return {"status": "ok", "id": eid, "updated": list(updates.keys()), "title": updates.get("title", row["title"])}


def _edit_task(args: dict, user_id: str) -> dict:
    tid = args["task_id"]
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM action_items WHERE id=? AND user_id=?", (tid, user_id)
    ).fetchone()
    conn.close()
    if not row:
        return {"status": "not_found", "message": "Task not found."}
    updates = {"updated_at": _now_iso()}
    if "title" in args:
        updates["title"] = args["title"]
    if "due_date" in args:
        updates["due_date"] = args["due_date"]
    if "priority" in args:
        updates["priority"] = args["priority"]
    update_row("action_items", updates, {"id": tid})
    return {"status": "ok", "id": tid, "updated": list(updates.keys()), "title": updates.get("title", row["title"])}


def _delete_note(args: dict, user_id: str) -> dict:
    nid = args["note_id"]
    conn = get_connection()
    row = conn.execute("SELECT id, title FROM notes WHERE id=? AND user_id=?", (nid, user_id)).fetchone()
    conn.close()
    if not row:
        return {"status": "not_found", "message": "Note not found."}
    delete_row("notes", {"id": nid, "user_id": user_id})
    return {"status": "ok", "deleted": row["title"]}


def _delete_bill(args: dict, user_id: str) -> dict:
    bid = args["bill_id"]
    conn = get_connection()
    row = conn.execute("SELECT id, name FROM subscriptions WHERE id=? AND user_id=?", (bid, user_id)).fetchone()
    conn.close()
    if not row:
        return {"status": "not_found", "message": "Bill not found."}
    update_row("subscriptions", {"is_active": 0}, {"id": bid})
    return {"status": "ok", "cancelled": row["name"]}


def _split_expense(args: dict, user_id: str) -> dict:
    total = float(args["amount"])
    split_count = int(args.get("split_count", 2))
    user_share = round(total / split_count, 2)
    date = args.get("date") or _today()
    import json as _json
    row = {
        "id": _uid(),
        "user_id": user_id,
        "date": date,
        "amount": user_share,
        "merchant": args.get("merchant", "Split expense"),
        "description": f"Split {split_count} ways with {args.get('split_with', 'others')}",
        "category": args.get("category", "Other"),
        "is_recurring": 0,
        "metadata": _json.dumps({
            "split": True, "full_amount": total,
            "split_count": split_count, "split_with": args.get("split_with", ""),
        }),
    }
    insert_row("transactions", row)
    new_bal = adjust_balance(user_id, -user_share)
    return {
        "status": "ok", "id": row["id"],
        "full_amount": total, "your_share": user_share,
        "split_count": split_count, "split_with": args.get("split_with", ""),
        "merchant": row["merchant"], "category": row["category"],
        "new_balance": round(new_bal, 2),
    }


def _get_spending_patterns(args: dict, user_id: str) -> dict:
    months_back = int(args.get("months", 3))
    now = datetime.now()
    start = (now - timedelta(days=months_back * 30)).strftime("%Y-%m-%d")
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM transactions WHERE user_id=? AND date>=? AND amount>0 ORDER BY date ASC",
        (user_id, start),
    ).fetchall()
    conn.close()

    weekday_total = 0.0
    weekend_total = 0.0
    weekday_count = 0
    weekend_count = 0
    monthly_totals: dict[str, float] = {}
    cat_totals: dict[str, float] = {}

    for r in rows:
        amt = float(r["amount"])
        try:
            d = datetime.strptime(r["date"], "%Y-%m-%d")
            if d.weekday() < 5:
                weekday_total += amt
                weekday_count += 1
            else:
                weekend_total += amt
                weekend_count += 1
            month_key = d.strftime("%Y-%m")
            monthly_totals[month_key] = monthly_totals.get(month_key, 0) + amt
        except ValueError:
            pass
        cat = r["category"] or "Other"
        cat_totals[cat] = cat_totals.get(cat, 0) + amt

    months_sorted = sorted(monthly_totals.keys())
    mom_changes = []
    for i in range(1, len(months_sorted)):
        prev = monthly_totals[months_sorted[i - 1]]
        curr = monthly_totals[months_sorted[i]]
        change = curr - prev
        pct = round(change / prev * 100, 1) if prev > 0 else 0
        mom_changes.append({"month": months_sorted[i], "change": round(change, 2), "pct": pct})

    biggest_cat_increase = None
    if len(months_sorted) >= 2:
        last_month = months_sorted[-1]
        prev_month = months_sorted[-2]
        last_by_cat: dict[str, float] = {}
        prev_by_cat: dict[str, float] = {}
        for r in rows:
            if r["date"][:7] == last_month:
                c = r["category"] or "Other"
                last_by_cat[c] = last_by_cat.get(c, 0) + float(r["amount"])
            elif r["date"][:7] == prev_month:
                c = r["category"] or "Other"
                prev_by_cat[c] = prev_by_cat.get(c, 0) + float(r["amount"])
        max_increase = 0
        for cat in last_by_cat:
            inc = last_by_cat[cat] - prev_by_cat.get(cat, 0)
            if inc > max_increase:
                max_increase = inc
                biggest_cat_increase = {"category": cat, "increase": round(inc, 2),
                                        "current": round(last_by_cat[cat], 2),
                                        "previous": round(prev_by_cat.get(cat, 0), 2)}

    return {
        "period_months": months_back,
        "total_transactions": len(rows),
        "weekday_avg": round(weekday_total / max(weekday_count, 1), 2),
        "weekend_avg": round(weekend_total / max(weekend_count, 1), 2),
        "weekday_total": round(weekday_total, 2),
        "weekend_total": round(weekend_total, 2),
        "monthly_totals": {k: round(v, 2) for k, v in monthly_totals.items()},
        "month_over_month": mom_changes,
        "biggest_category_increase": biggest_cat_increase,
        "top_categories": sorted(
            [{"category": k, "total": round(v, 2)} for k, v in cat_totals.items()],
            key=lambda x: -x["total"]
        )[:10],
    }


def _search_transactions(args: dict, user_id: str) -> dict:
    query = args.get("query", "").lower()
    date_from = args.get("date_from", "")
    date_to = args.get("date_to", "")
    category = args.get("category", "")

    conn = get_connection()
    sql = "SELECT * FROM transactions WHERE user_id=?"
    params: list = [user_id]
    if date_from:
        sql += " AND date>=?"
        params.append(date_from)
    if date_to:
        sql += " AND date<=?"
        params.append(date_to)
    if category:
        sql += " AND category=?"
        params.append(category)
    sql += " ORDER BY date DESC LIMIT 50"
    rows = conn.execute(sql, params).fetchall()
    conn.close()

    results = []
    for r in rows:
        merchant = (r["merchant"] or "").lower()
        desc = (r["description"] or "").lower()
        if query and query not in merchant and query not in desc:
            continue
        results.append({
            "id": r["id"], "date": r["date"],
            "merchant": r["merchant"], "category": r["category"],
            "amount": float(r["amount"]),
        })

    return {"query": query, "results": results, "count": len(results)}


def _get_custom_categories(user_id: str) -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM custom_categories WHERE user_id=? AND is_active=1 ORDER BY name",
        (user_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ── Money Left After Goals ────────────────────────────────────────────────────

def _get_money_left_after_goals(args: dict, user_id: str) -> dict:
    month = args.get("month") or _current_month()
    now = datetime.now()

    bal = get_balance(user_id)
    from db import get_total_monthly_income
    monthly_income = get_total_monthly_income(user_id)

    conn = get_connection()
    expense_rows = conn.execute(
        "SELECT SUM(amount) as total FROM transactions WHERE user_id=? AND date LIKE ? AND amount>0",
        (user_id, f"{month}%"),
    ).fetchone()
    bills = conn.execute(
        "SELECT SUM(amount) as total FROM subscriptions WHERE user_id=? AND is_active=1 AND frequency='monthly'",
        (user_id,),
    ).fetchone()
    goals = conn.execute(
        "SELECT * FROM goals WHERE user_id=? AND is_completed=0",
        (user_id,),
    ).fetchall()
    conn.close()

    total_expenses = float(expense_rows["total"] or 0)
    monthly_bills = float(bills["total"] or 0)

    goals_total = 0.0
    goal_details = []
    for g in goals:
        current = float(g["current_amount"])
        goals_total += current
        goal_details.append({"name": g["name"], "saved": round(current, 2),
                             "target": float(g["target_amount"])})

    balance_after_goals = round(bal - goals_total, 2)

    return {
        "month": month,
        "balance": round(bal, 2),
        "monthly_income": round(monthly_income, 2),
        "monthly_bills_total": round(monthly_bills, 2),
        "goals_earmarked": round(goals_total, 2),
        "balance_after_goals": balance_after_goals,
        "spent_so_far": round(total_expenses, 2),
        "goal_breakdown": goal_details,
    }


# ── Subscription Health ────────────────────────────────────────────────────────

def _get_subscription_health(args: dict, user_id: str) -> dict:
    """Find active subscriptions with no matching transaction in the last 90 days."""
    ninety_days_ago = (datetime.now() - timedelta(days=90)).strftime("%Y-%m-%d")
    conn = get_connection()
    subs = conn.execute(
        "SELECT * FROM subscriptions WHERE user_id=? AND is_active=1",
        (user_id,),
    ).fetchall()

    dormant = []
    healthy = []
    for sub in [dict(s) for s in subs]:
        name_fragment = sub["name"].lower()[:12]
        txn = conn.execute(
            "SELECT id FROM transactions WHERE user_id=? AND date>=? AND amount>0 AND LOWER(merchant) LIKE ?",
            (user_id, ninety_days_ago, f"%{name_fragment}%"),
        ).fetchone()
        if txn:
            healthy.append(sub["name"])
        else:
            freq = sub.get("frequency", "monthly")
            amt = float(sub.get("amount", 0))
            if freq == "yearly":
                monthly_cost = round(amt / 12, 2)
            elif freq == "weekly":
                monthly_cost = round(amt * 4.33, 2)
            elif freq == "bi-weekly":
                monthly_cost = round(amt * 2.17, 2)
            else:
                monthly_cost = amt
            dormant.append({
                "name": sub["name"],
                "amount": amt,
                "frequency": freq,
                "monthly_cost": monthly_cost,
                "next_due": sub.get("next_due", ""),
                "id": sub["id"],
            })

    conn.close()
    total_dormant_monthly = round(sum(d["monthly_cost"] for d in dormant), 2)
    return {
        "status": "ok",
        "dormant_subscriptions": dormant,
        "dormant_count": len(dormant),
        "dormant_monthly_cost": total_dormant_monthly,
        "dormant_annual_cost": round(total_dormant_monthly * 12, 2),
        "healthy_subscriptions": healthy,
        "healthy_count": len(healthy),
        "check_window_days": 90,
    }


# ── Mood × Spending Correlation ────────────────────────────────────────────────

def _get_mood_spending_report(args: dict, user_id: str) -> dict:
    """Correlate mood journal entries with spending on the same day (±1 day window)."""
    conn = get_connection()
    notes = conn.execute(
        "SELECT mood, created_at FROM notes WHERE user_id=? AND mood!='' AND mood IS NOT NULL",
        (user_id,),
    ).fetchall()

    if len(notes) < 3:
        conn.close()
        return {
            "status": "insufficient_data",
            "message": "Need at least 3 mood journal entries to generate a pattern.",
            "notes_with_mood": len(notes),
        }

    mood_buckets: dict[str, list[float]] = {}
    for note in notes:
        mood = note["mood"]
        note_date_str = (note["created_at"] or "")[:10]
        if not note_date_str:
            continue
        try:
            note_dt = datetime.strptime(note_date_str, "%Y-%m-%d")
        except ValueError:
            continue
        date_from = (note_dt - timedelta(days=1)).strftime("%Y-%m-%d")
        date_to = (note_dt + timedelta(days=1)).strftime("%Y-%m-%d")
        row = conn.execute(
            "SELECT SUM(amount) as total FROM transactions "
            "WHERE user_id=? AND date>=? AND date<=? AND amount>0",
            (user_id, date_from, date_to),
        ).fetchone()
        day_spend = float(row["total"] or 0)
        mood_buckets.setdefault(mood, []).append(day_spend)

    conn.close()

    results = []
    for mood, amounts in mood_buckets.items():
        avg = round(sum(amounts) / len(amounts), 2) if amounts else 0
        results.append({
            "mood": mood,
            "avg_daily_spending": avg,
            "sample_size": len(amounts),
            "total_spending": round(sum(amounts), 2),
        })
    results.sort(key=lambda x: -x["avg_daily_spending"])

    highest = results[0] if results else None
    lowest = results[-1] if len(results) > 1 else None
    insight = ""
    if highest and lowest and highest["mood"] != lowest["mood"]:
        diff = round(highest["avg_daily_spending"] - lowest["avg_daily_spending"], 2)
        insight = (
            f"You spend ${diff:.0f}/day more when {highest['mood']} than when {lowest['mood']}. "
            f"On {highest['mood']} days: ${highest['avg_daily_spending']:.0f} avg. "
            f"On {lowest['mood']} days: ${lowest['avg_daily_spending']:.0f} avg."
        )

    return {
        "status": "ok",
        "mood_spending": results,
        "highest_spending_mood": highest,
        "lowest_spending_mood": lowest,
        "insight": insight,
        "total_mood_entries_analysed": len(notes),
    }


# ── User Lists ────────────────────────────────────────────────────────────────


def _create_list(args: dict, user_id: str) -> dict:
    name = args["name"]
    color = args.get("color", "#ffffff")
    initial_items = args.get("items", [])
    list_id = _uid()
    now = _now_iso()
    conn = get_connection()
    row = conn.execute(
        "SELECT COALESCE(MAX(sort_order),0) as val FROM user_lists WHERE user_id=?",
        (user_id,),
    ).fetchone()
    max_order = row["val"] if isinstance(row, dict) else row[0]
    conn.close()
    insert_row("user_lists", {
        "id": list_id,
        "user_id": user_id,
        "name": name,
        "icon": "",
        "color": color,
        "sort_order": max_order + 1,
        "created_at": now,
    })
    added = []
    for i, item_name in enumerate(initial_items):
        insert_row("list_items", {
            "id": _uid(),
            "list_id": list_id,
            "user_id": user_id,
            "name": item_name,
            "notes": "",
            "is_checked": 0,
            "sort_order": i + 1,
            "added_at": now,
        })
        added.append(item_name)
    result = {"status": "ok", "id": list_id, "name": name, "color": color}
    if added:
        result["items_added"] = added
        result["item_count"] = len(added)
    return result


def _add_list_items(args: dict, user_id: str) -> dict:
    list_id = args["list_id"]
    items = args.get("items", [])
    added = []
    conn = get_connection()
    row = conn.execute(
        "SELECT COALESCE(MAX(sort_order),0) as val FROM list_items WHERE list_id=?",
        (list_id,),
    ).fetchone()
    max_order = row["val"] if isinstance(row, dict) else row[0]
    conn.close()
    for i, name in enumerate(items):
        insert_row("list_items", {
            "id": _uid(),
            "list_id": list_id,
            "user_id": user_id,
            "name": name,
            "notes": "",
            "is_checked": 0,
            "sort_order": max_order + 1 + i,
            "added_at": _now_iso(),
        })
        added.append(name)
    return {
        "status": "ok",
        "list_id": list_id,
        "added": added,
        "count_added": len(added),
    }


def _get_user_lists(args: dict, user_id: str) -> dict:
    conn = get_connection()
    lists = conn.execute(
        "SELECT * FROM user_lists WHERE user_id=? ORDER BY sort_order ASC, created_at ASC",
        (user_id,),
    ).fetchall()
    result = []
    for lst in lists:
        d = dict(lst)
        ic_row = conn.execute(
            "SELECT COUNT(*) as cnt FROM list_items WHERE list_id=? AND is_checked=0",
            (d["id"],),
        ).fetchone()
        item_count = ic_row["cnt"] if isinstance(ic_row, dict) else ic_row[0]
        result.append({"id": d["id"], "name": d["name"], "item_count": item_count})
    conn.close()
    return {"status": "ok", "lists": result, "count": len(result)}


# ── Canonical READ/ANALYSIS wrappers (9-section prompt surface) ───────────────

def _get_bills(args: dict, user_id: str) -> dict:
    """Retrieve bills / subscriptions, optionally filtered by ISO date range."""
    status = (args.get("status") or "active").lower()
    date_range = args.get("date_range") or {}
    date_from = date_range.get("from")
    date_to = date_range.get("to")
    category = args.get("category")

    sql = "SELECT * FROM subscriptions WHERE user_id=?"
    params: list = [user_id]
    if status == "active":
        sql += " AND is_active=1"
    elif status == "inactive":
        sql += " AND is_active=0"
    if category:
        sql += " AND category=?"
        params.append(category)
    if date_from:
        sql += " AND next_due >= ?"
        params.append(date_from)
    if date_to:
        sql += " AND next_due <= ?"
        params.append(date_to)
    sql += " ORDER BY next_due ASC"

    conn = get_connection()
    rows = conn.execute(sql, tuple(params)).fetchall()
    conn.close()
    bills = [dict(r) if not isinstance(r, dict) else r for r in rows]
    total = sum(float(b.get("amount") or 0) for b in bills)
    return {
        "status": "ok",
        "count": len(bills),
        "total": round(total, 2),
        "bills": bills,
    }


def _get_expenses(args: dict, user_id: str) -> dict:
    """Retrieve logged expenses with optional filters."""
    date_range = args.get("date_range") or {}
    date_from = date_range.get("from")
    date_to = date_range.get("to")
    category = args.get("category")
    search = (args.get("search") or "").strip()
    try:
        limit = int(args.get("limit") or 50)
    except (TypeError, ValueError):
        limit = 50
    limit = max(1, min(limit, 500))

    sql = "SELECT * FROM transactions WHERE user_id=?"
    params: list = [user_id]
    if date_from:
        sql += " AND date >= ?"
        params.append(date_from)
    if date_to:
        sql += " AND date <= ?"
        params.append(date_to)
    if category:
        sql += " AND category=?"
        params.append(category)
    if search:
        sql += " AND (LOWER(merchant) LIKE ? OR LOWER(description) LIKE ?)"
        params.extend([f"%{search.lower()}%", f"%{search.lower()}%"])
    sql += " ORDER BY date DESC, id DESC LIMIT ?"
    params.append(limit)

    conn = get_connection()
    rows = conn.execute(sql, tuple(params)).fetchall()
    conn.close()
    expenses = [dict(r) if not isinstance(r, dict) else r for r in rows]
    total = sum(float(e.get("amount") or 0) for e in expenses)
    return {
        "status": "ok",
        "count": len(expenses),
        "total": round(total, 2),
        "expenses": expenses,
    }


def _get_notes(args: dict, user_id: str) -> dict:
    """Retrieve plain notes (non-journal). Delegates to _search_notes for filtering."""
    if args.get("search") or args.get("tag"):
        return _search_notes(
            {"query": args.get("search"), "tag": args.get("tag"),
             "limit": args.get("limit", 20)},
            user_id,
        )
    try:
        limit = int(args.get("limit") or 20)
    except (TypeError, ValueError):
        limit = 20
    limit = max(1, min(limit, 200))
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM notes WHERE user_id=? AND (is_journal=0 OR is_journal IS NULL) "
        "ORDER BY is_pinned DESC, created_at DESC LIMIT ?",
        (user_id, limit),
    ).fetchall()
    conn.close()
    notes = [dict(r) if not isinstance(r, dict) else r for r in rows]
    return {"status": "ok", "count": len(notes), "notes": notes}


def _log_journal_entry(args: dict, user_id: str) -> dict:
    """Log a mood-tagged journal entry into the notes table with is_journal=1."""
    content = (args.get("content") or "").strip()
    mood = (args.get("mood") or "neutral").lower()
    if not content:
        return {"status": "error", "message": "Journal content is required."}
    title = args.get("title") or f"Journal — {args.get('date') or _today()}"
    tags = args.get("tags") or ""
    entry_date = args.get("date") or _today()
    row = {
        "id": _uid(),
        "user_id": user_id,
        "title": title,
        "content": content,
        "mood": mood,
        "tags": tags,
        "is_pinned": 0,
        "is_journal": 1,
        "entry_date": entry_date,
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    insert_row("notes", row)
    return {
        "status": "ok",
        "id": row["id"],
        "mood": mood,
        "date": entry_date,
        "title": title,
    }


def _get_journal(args: dict, user_id: str) -> dict:
    """Retrieve journal (mood-tagged) entries with optional filters."""
    date_range = args.get("date_range") or {}
    date_from = date_range.get("from")
    date_to = date_range.get("to")
    mood = args.get("mood")
    try:
        limit = int(args.get("limit") or 20)
    except (TypeError, ValueError):
        limit = 20
    limit = max(1, min(limit, 200))

    sql = "SELECT * FROM notes WHERE user_id=? AND is_journal=1"
    params: list = [user_id]
    if date_from:
        sql += " AND (entry_date >= ? OR created_at >= ?)"
        params.extend([date_from, date_from])
    if date_to:
        sql += " AND (entry_date <= ? OR created_at <= ?)"
        params.extend([date_to, date_to])
    if mood:
        sql += " AND mood=?"
        params.append(mood)
    sql += " ORDER BY COALESCE(entry_date, created_at) DESC LIMIT ?"
    params.append(limit)

    conn = get_connection()
    rows = conn.execute(sql, tuple(params)).fetchall()
    conn.close()
    entries = [dict(r) if not isinstance(r, dict) else r for r in rows]
    return {"status": "ok", "count": len(entries), "entries": entries}


def _generate_insights(args: dict, user_id: str) -> dict:
    """Composite analytical view combining spending, budget, patterns, goals, and wellness."""
    scope = set(args.get("scope") or ["expenses", "bills", "goals"])
    focus = args.get("focus") or "general"
    date_range = args.get("date_range") or {}
    month = _current_month()
    if date_range.get("from"):
        month = str(date_range["from"])[:7]

    result: dict = {"status": "ok", "focus": focus, "scope": list(scope), "sections": {}}
    try:
        if "expenses" in scope:
            result["sections"]["spending_summary"] = _get_spending_summary(
                {"month": month}, user_id
            )
            result["sections"]["budget_status"] = _get_budget_status(
                {"month": month}, user_id
            )
            result["sections"]["patterns"] = _get_spending_patterns({}, user_id)
        if "bills" in scope:
            result["sections"]["subscription_health"] = _get_subscription_health(
                {}, user_id
            )
        if "goals" in scope:
            result["sections"]["goals"] = _get_goals({}, user_id)
            result["sections"]["money_left_after_goals"] = _get_money_left_after_goals(
                {}, user_id
            )
        if "journal" in scope:
            result["sections"]["mood_spending"] = _get_mood_spending_report({}, user_id)
        if "wellness" in scope:
            result["sections"]["wellness"] = _get_wellness_history(
                {"date_from": date_range.get("from"), "date_to": date_range.get("to")},
                user_id,
            )
    except Exception as e:  # pragma: no cover - defensive
        logger.error("generate_insights partial failure: %s", e)
        result["partial_error"] = str(e)
    return result


def _generate_forecast(args: dict, user_id: str) -> dict:
    """Forward-looking projection blending balance, bills, and goal targets."""
    try:
        horizon = int(args.get("horizon_days") or 30)
    except (TypeError, ValueError):
        horizon = 30
    horizon = max(7, min(horizon, 365))
    scope = set(args.get("scope") or ["expenses", "bills", "goals"])
    scenario = args.get("scenario") or "baseline"
    assumptions = args.get("assumptions") or []

    balance = _get_balance({}, user_id)
    upcoming = _get_upcoming_schedule({"days": horizon}, user_id)
    goals_info = _get_money_left_after_goals({}, user_id) if "goals" in scope else None

    scheduled_bill_total = 0.0
    try:
        items_iter = (upcoming or {}).get("items", []) if isinstance(upcoming, dict) else []
        for item in items_iter:
            if item.get("type") == "bill":
                scheduled_bill_total += float(item.get("amount") or 0)
    except Exception:
        pass

    current = float((balance or {}).get("balance", 0) or 0)
    projected = current - scheduled_bill_total
    if scenario == "pessimistic":
        projected -= 0.10 * max(scheduled_bill_total, 0)
    elif scenario == "optimistic":
        projected += 0.10 * max(scheduled_bill_total, 0)

    return {
        "status": "ok",
        "horizon_days": horizon,
        "scenario": scenario,
        "scope": list(scope),
        "assumptions": list(assumptions),
        "current_balance": round(current, 2),
        "scheduled_outflows": round(scheduled_bill_total, 2),
        "projected_balance": round(projected, 2),
        "upcoming": upcoming,
        "goal_impact": goals_info,
    }


def _generate_yearly_summary(args: dict, user_id: str) -> dict:
    """Year-in-review across selected sections."""
    try:
        year = int(args["year"])
    except (KeyError, TypeError, ValueError):
        return {"status": "error", "message": "year (4-digit integer) is required."}
    sections = set(args.get("sections") or ["expenses", "bills", "goals"])
    date_from = f"{year}-01-01"
    date_to = f"{year}-12-31"

    summary: dict = {"status": "ok", "year": year, "sections": {}}
    if "expenses" in sections:
        summary["sections"]["expenses"] = _get_expenses(
            {"date_range": {"from": date_from, "to": date_to}, "limit": 500}, user_id
        )
    if "bills" in sections:
        summary["sections"]["bills"] = _get_bills(
            {"date_range": {"from": date_from, "to": date_to}, "status": "all"}, user_id
        )
    if "goals" in sections:
        summary["sections"]["goals"] = _get_goals({"include_completed": True}, user_id)
    if "journal" in sections:
        summary["sections"]["journal"] = _get_journal(
            {"date_range": {"from": date_from, "to": date_to}, "limit": 200}, user_id
        )
    if "calendar" in sections:
        summary["sections"]["calendar"] = _get_upcoming_schedule({"days": 365}, user_id)
    return summary


# ── Wellness History ──────────────────────────────────────────────────────────

def _get_wellness_history(args: dict, user_id: str) -> dict:
    """Return reset-session completions, mood pre/post trends, and streak data."""
    now = datetime.now()
    date_from = args.get("date_from") or (now - timedelta(days=30)).strftime("%Y-%m-%d")
    date_to = args.get("date_to") or now.strftime("%Y-%m-%d")
    anchor_filter = args.get("anchor_id", "")
    include_streaks = args.get("include_streaks", True)

    conn = get_connection()
    sql = (
        "SELECT * FROM reset_completions "
        "WHERE user_id=? AND date_key>=? AND date_key<=?"
    )
    params: list = [user_id, date_from, date_to]
    if anchor_filter:
        sql += " AND anchor_id=?"
        params.append(anchor_filter)
    sql += " ORDER BY date_key ASC"
    completions = conn.execute(sql, tuple(params)).fetchall()

    total_sessions = len(completions)
    total_duration = 0
    moods_pre: list[str] = []
    moods_post: list[str] = []
    for c in completions:
        c = dict(c) if not isinstance(c, dict) else c
        total_duration += int(c.get("duration") or 0)
        if c.get("pre_mood"):
            moods_pre.append(c["pre_mood"])
        if c.get("post_mood"):
            moods_post.append(c["post_mood"])

    def _mood_summary(moods: list[str]) -> dict:
        if not moods:
            return {}
        from collections import Counter
        counts = Counter(moods)
        return {mood: cnt for mood, cnt in counts.most_common()}

    result: dict = {
        "status": "ok",
        "date_from": date_from,
        "date_to": date_to,
        "total_sessions": total_sessions,
        "total_duration_min": total_duration,
        "avg_duration_min": round(total_duration / max(total_sessions, 1), 1),
        "pre_mood_distribution": _mood_summary(moods_pre),
        "post_mood_distribution": _mood_summary(moods_post),
        "sessions": [
            {
                "date": (dict(c) if not isinstance(c, dict) else c).get("date_key"),
                "anchor_id": (dict(c) if not isinstance(c, dict) else c).get("anchor_id"),
                "duration": (dict(c) if not isinstance(c, dict) else c).get("duration"),
                "pre_mood": (dict(c) if not isinstance(c, dict) else c).get("pre_mood"),
                "post_mood": (dict(c) if not isinstance(c, dict) else c).get("post_mood"),
                "note": (dict(c) if not isinstance(c, dict) else c).get("note"),
            }
            for c in completions[:50]
        ],
    }

    if include_streaks:
        streaks = conn.execute(
            "SELECT s.id, s.name, s.emoji, s.target_days, "
            "  (SELECT COUNT(*) FROM streak_days sd WHERE sd.streak_id=s.id) as total_days, "
            "  (SELECT MAX(sd.date_key) FROM streak_days sd WHERE sd.streak_id=s.id) as last_day "
            "FROM streaks s WHERE s.user_id=?",
            (user_id,),
        ).fetchall()
        streak_list = []
        for s in streaks:
            s = dict(s) if not isinstance(s, dict) else s
            last_day = s.get("last_day", "")
            is_active = last_day == now.strftime("%Y-%m-%d") or last_day == (now - timedelta(days=1)).strftime("%Y-%m-%d")
            streak_list.append({
                "name": s["name"],
                "emoji": s.get("emoji", ""),
                "total_days": s.get("total_days", 0),
                "target_days": s.get("target_days"),
                "last_day": last_day,
                "is_active": is_active,
            })
        result["streaks"] = streak_list

    conn.close()
    return result


# ── Period Comparison ────────────────────────────────────────────────────────

def _compare_periods(args: dict, user_id: str) -> dict:
    """Compare two time periods across spending, wellness, journal mood, or streaks."""
    scope = args["scope"]
    pa_from, pa_to = args["period_a_from"], args["period_a_to"]
    pb_from, pb_to = args["period_b_from"], args["period_b_to"]
    category = args.get("category", "")

    conn = get_connection()

    if scope == "spending":
        def _spend(d_from: str, d_to: str) -> dict:
            sql = "SELECT category, SUM(amount) as total, COUNT(*) as cnt FROM transactions WHERE user_id=? AND date>=? AND date<=? AND amount>0"
            p: list = [user_id, d_from, d_to]
            if category:
                sql += " AND category=?"
                p.append(category)
            sql += " GROUP BY category"
            rows = conn.execute(sql, tuple(p)).fetchall()
            total = sum(float(r["total"]) for r in rows)
            by_cat = {r["category"]: round(float(r["total"]), 2) for r in rows}
            return {"total": round(total, 2), "by_category": by_cat, "txn_count": sum(r["cnt"] for r in rows)}
        a = _spend(pa_from, pa_to)
        b = _spend(pb_from, pb_to)
        diff = round(b["total"] - a["total"], 2)
        pct = round((diff / a["total"] * 100) if a["total"] > 0 else 0, 1)
        conn.close()
        return {"scope": "spending", "period_a": {"from": pa_from, "to": pa_to, **a}, "period_b": {"from": pb_from, "to": pb_to, **b}, "change": diff, "change_pct": pct}

    if scope == "wellness":
        def _well(d_from: str, d_to: str) -> dict:
            rows = conn.execute(
                "SELECT COUNT(*) as cnt, COALESCE(SUM(duration),0) as dur FROM reset_completions WHERE user_id=? AND date_key>=? AND date_key<=?",
                (user_id, d_from, d_to),
            ).fetchone()
            return {"sessions": rows["cnt"], "total_duration_min": int(rows["dur"])}
        a = _well(pa_from, pa_to)
        b = _well(pb_from, pb_to)
        conn.close()
        return {"scope": "wellness", "period_a": {"from": pa_from, "to": pa_to, **a}, "period_b": {"from": pb_from, "to": pb_to, **b}, "session_change": b["sessions"] - a["sessions"], "duration_change": b["total_duration_min"] - a["total_duration_min"]}

    if scope == "journal_mood":
        from collections import Counter
        def _moods(d_from: str, d_to: str) -> dict:
            rows = conn.execute(
                "SELECT mood FROM notes WHERE user_id=? AND is_journal=1 AND (entry_date>=? OR created_at>=?) AND (entry_date<=? OR created_at<=?)",
                (user_id, d_from, d_from, d_to, d_to),
            ).fetchall()
            moods = [r["mood"] for r in rows if r["mood"]]
            return {"entry_count": len(rows), "mood_distribution": dict(Counter(moods))}
        a = _moods(pa_from, pa_to)
        b = _moods(pb_from, pb_to)
        conn.close()
        return {"scope": "journal_mood", "period_a": {"from": pa_from, "to": pa_to, **a}, "period_b": {"from": pb_from, "to": pb_to, **b}}

    if scope == "streaks":
        def _streak_days(d_from: str, d_to: str) -> dict:
            rows = conn.execute(
                "SELECT s.name, COUNT(sd.id) as days FROM streak_days sd "
                "JOIN streaks s ON s.id=sd.streak_id "
                "WHERE sd.user_id=? AND sd.date_key>=? AND sd.date_key<=? "
                "GROUP BY s.name",
                (user_id, d_from, d_to),
            ).fetchall()
            return {"by_streak": {r["name"]: r["days"] for r in rows}, "total_days": sum(r["days"] for r in rows)}
        a = _streak_days(pa_from, pa_to)
        b = _streak_days(pb_from, pb_to)
        conn.close()
        return {"scope": "streaks", "period_a": {"from": pa_from, "to": pa_to, **a}, "period_b": {"from": pb_from, "to": pb_to, **b}, "day_change": b["total_days"] - a["total_days"]}

    conn.close()
    return {"status": "error", "message": f"Unknown scope: {scope}"}


# ── Cross-Feature Search ─────────────────────────────────────────────────────

def _cross_feature_search(args: dict, user_id: str) -> dict:
    """Unified search across journal, notes, transactions, events, lists, and goals."""
    query = (args.get("query") or "").lower()
    if not query:
        return {"status": "error", "message": "query is required."}
    features = set(args.get("features") or ["journal", "notes", "transactions", "events", "lists", "goals"])
    try:
        limit = int(args.get("limit") or 10)
    except (TypeError, ValueError):
        limit = 10
    limit = max(1, min(limit, 50))

    conn = get_connection()
    results: dict = {"status": "ok", "query": query, "features": {}}

    if "journal" in features:
        rows = conn.execute(
            "SELECT id, title, content, mood, entry_date, created_at FROM notes "
            "WHERE user_id=? AND is_journal=1 AND (LOWER(title) LIKE ? OR LOWER(content) LIKE ?) "
            "ORDER BY COALESCE(entry_date, created_at) DESC LIMIT ?",
            (user_id, f"%{query}%", f"%{query}%", limit),
        ).fetchall()
        results["features"]["journal"] = [
            {"id": r["id"], "title": r["title"], "preview": (r["content"] or "")[:200], "mood": r["mood"], "date": r["entry_date"] or r["created_at"]}
            for r in rows
        ]

    if "notes" in features:
        rows = conn.execute(
            "SELECT id, title, content, tags, updated_at FROM notes "
            "WHERE user_id=? AND (is_journal=0 OR is_journal IS NULL) AND (LOWER(title) LIKE ? OR LOWER(content) LIKE ? OR LOWER(tags) LIKE ?) "
            "ORDER BY updated_at DESC LIMIT ?",
            (user_id, f"%{query}%", f"%{query}%", f"%{query}%", limit),
        ).fetchall()
        results["features"]["notes"] = [
            {"id": r["id"], "title": r["title"], "preview": (r["content"] or "")[:200], "tags": r["tags"], "updated_at": r["updated_at"]}
            for r in rows
        ]

    if "transactions" in features:
        rows = conn.execute(
            "SELECT id, merchant, amount, date, category, description FROM transactions "
            "WHERE user_id=? AND (LOWER(merchant) LIKE ? OR LOWER(category) LIKE ? OR LOWER(description) LIKE ?) "
            "ORDER BY date DESC LIMIT ?",
            (user_id, f"%{query}%", f"%{query}%", f"%{query}%", limit),
        ).fetchall()
        results["features"]["transactions"] = [
            {"id": r["id"], "merchant": r["merchant"], "amount": float(r["amount"]), "date": r["date"], "category": r["category"]}
            for r in rows
        ]

    if "events" in features:
        rows = conn.execute(
            "SELECT id, title, event_date, event_type, notes FROM events "
            "WHERE user_id=? AND (LOWER(title) LIKE ? OR LOWER(notes) LIKE ?) "
            "ORDER BY event_date DESC LIMIT ?",
            (user_id, f"%{query}%", f"%{query}%", limit),
        ).fetchall()
        results["features"]["events"] = [
            {"id": r["id"], "title": r["title"], "date": r["event_date"], "type": r.get("event_type", "")}
            for r in rows
        ]

    if "lists" in features:
        rows = conn.execute(
            "SELECT li.id, li.name, li.is_checked, ul.name as list_name FROM list_items li "
            "JOIN user_lists ul ON ul.id=li.list_id "
            "WHERE li.user_id=? AND LOWER(li.name) LIKE ? "
            "ORDER BY li.sort_order ASC LIMIT ?",
            (user_id, f"%{query}%", limit),
        ).fetchall()
        results["features"]["lists"] = [
            {"id": r["id"], "item": r["name"], "list": r["list_name"], "checked": bool(r["is_checked"])}
            for r in rows
        ]

    if "goals" in features:
        rows = conn.execute(
            "SELECT id, name, target_amount, current_amount, target_date, category, is_completed FROM goals "
            "WHERE user_id=? AND (LOWER(name) LIKE ? OR LOWER(category) LIKE ? OR LOWER(notes) LIKE ?) "
            "ORDER BY created_at DESC LIMIT ?",
            (user_id, f"%{query}%", f"%{query}%", f"%{query}%", limit),
        ).fetchall()
        results["features"]["goals"] = [
            {"id": r["id"], "name": r["name"], "target": float(r["target_amount"]), "current": float(r["current_amount"]), "category": r["category"], "completed": bool(r["is_completed"])}
            for r in rows
        ]

    conn.close()

    total = sum(len(v) for v in results["features"].values())
    results["total_results"] = total
    return results


# ── Dispatcher ────────────────────────────────────────────────────────────────
#
# _TOOL_MAP contains every backing function keyed by BOTH the canonical 16-tool
# names (the prompt surface Grok is taught about) and legacy aliases that still
# ship in TOOL_SCHEMAS or might arrive in stale tool-call histories. Adding an
# alias here is free — we only *advertise* the 16 canonical names to Grok via
# the updated system prompt, but the dispatcher still honours legacy names so
# historical conversations and extra orphan tools keep working.

