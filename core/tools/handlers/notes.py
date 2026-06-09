"""Tool handlers — notes."""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timedelta, timezone

from db import (
    delete_row,
    fetch_rows,
    get_connection,
    insert_row,
    update_row,
)
from db.finance import (
    adjust_balance,
    get_balance,
    get_or_create_balance_account,
    update_balance,
)
from core.tools.shared import (
    _now_iso,
    _today,
    _uid
)

logger = logging.getLogger(__name__)


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
def _delete_note(args: dict, user_id: str) -> dict:
    nid = args["note_id"]
    conn = get_connection()
    row = conn.execute("SELECT id, title FROM notes WHERE id=? AND user_id=?", (nid, user_id)).fetchone()
    conn.close()
    if not row:
        return {"status": "not_found", "message": "Note not found."}
    delete_row("notes", {"id": nid, "user_id": user_id})
    return {"status": "ok", "deleted": row["title"]}
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
