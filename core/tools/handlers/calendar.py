"""Tool handlers — calendar."""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timedelta, timezone

from core.event_dates import format_event_date, split_event_date
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
    _reminder_label,
    _today,
    _uid
)

logger = logging.getLogger(__name__)


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
    if not insert_row("events", row):
        return {
            "status": "error",
            "message": f"Could not save calendar event: {title}",
        }
    from core.integrations.google_calendar import push_event_to_google
    push_event_to_google(user_id, row)

    reminder_label = _reminder_label(reminder)
    return {
        "status": "ok", "id": row["id"], "title": title,
        "date": date, "time": time, "reminder": reminder_label,
    }
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
def _get_upcoming_schedule(args: dict, user_id: str) -> dict:
    days = int(args.get("days", 14))
    now = datetime.now()
    end_date = (now + timedelta(days=days)).strftime("%Y-%m-%d")
    today = now.strftime("%Y-%m-%d")

    conn = get_connection()
    events = conn.execute(
        "SELECT * FROM events WHERE user_id=? AND substr(event_date, 1, 10)>=? "
        "ORDER BY event_date ASC LIMIT 20",
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
        old_date_str, old_time_str = split_event_date(row["event_date"])
        d = new_date or old_date_str
        t = new_time if new_time is not None else old_time_str
        updates["event_date"] = format_event_date(d, t)
    if "title" in args:
        updates["title"] = args["title"]
    if "description" in args:
        updates["description"] = args["description"]
    if not updates:
        return {"status": "no_changes"}
    update_row("events", updates, {"id": eid})
    return {"status": "ok", "id": eid, "updated": list(updates.keys()), "title": updates.get("title", row["title"])}
def _get_emails(args: dict, user_id: str) -> dict:
    """Fetch recent Gmail messages for the user, optionally filtered by a search query."""
    query = (args.get("query") or "").strip()
    max_results = min(int(args.get("max_results", 10)), 25)

    try:
        from core.integrations.gmail import fetch_gmail_messages, get_gmail_profile
    except ImportError:
        return {"status": "error", "message": "Gmail integration not available."}

    if query:
        messages = _search_gmail(user_id, query, max_results)
    else:
        messages = fetch_gmail_messages(user_id, max_results=max_results)

    if not messages and messages is not None:
        profile = get_gmail_profile(user_id)
        if profile is None:
            return {
                "status": "not_connected",
                "message": "Gmail is not connected. The user can connect it in Settings → Connected Accounts.",
            }

    if messages is None:
        return {
            "status": "not_connected",
            "message": "Gmail is not connected. The user can connect it in Settings → Connected Accounts.",
        }

    return {
        "status": "ok",
        "count": len(messages),
        "query": query or None,
        "messages": messages,
        "gmail_inbox_url": "https://mail.google.com/mail/u/0/#inbox",
        "gmail_search_url": (
            f"https://mail.google.com/mail/u/0/#search/{query.replace(' ', '+')}"
            if query else None
        ),
    }


def _search_gmail(user_id: str, query: str, max_results: int) -> list | None:
    """Search Gmail messages using the Gmail API query syntax."""
    from core.integrations.google_tokens import get_google_tokens, store_google_tokens
    from config import GOOGLE_GMAIL_ENABLED

    if not GOOGLE_GMAIL_ENABLED:
        return None

    tokens = get_google_tokens(user_id)
    if not tokens or not any("gmail" in s for s in tokens.get("scopes", [])):
        return None

    try:
        from google.oauth2.credentials import Credentials
        import google.auth.transport.requests
        from googleapiclient.discovery import build
    except ImportError:
        return None

    creds = Credentials(**tokens)
    if creds.expired and creds.refresh_token:
        creds.refresh(google.auth.transport.requests.Request())
        store_google_tokens(user_id, {
            "token": creds.token, "refresh_token": creds.refresh_token,
            "token_uri": creds.token_uri, "client_id": creds.client_id,
            "client_secret": creds.client_secret,
            "scopes": list(creds.scopes or tokens.get("scopes", [])),
        })

    service = build("gmail", "v1", credentials=creds)
    result = service.users().messages().list(
        userId="me", q=query, maxResults=max_results,
    ).execute()
    refs = result.get("messages", [])

    messages = []
    for ref in refs:
        try:
            msg = service.users().messages().get(
                userId="me", id=ref["id"], format="metadata",
                metadataHeaders=["Subject", "From", "Date"],
            ).execute()
            headers = {h["name"]: h["value"] for h in msg.get("payload", {}).get("headers", [])}
            messages.append({
                "id": msg["id"],
                "thread_id": msg.get("threadId", ""),
                "subject": headers.get("Subject", "(no subject)"),
                "from": headers.get("From", ""),
                "date": headers.get("Date", ""),
                "snippet": msg.get("snippet", ""),
                "labels": msg.get("labelIds", []),
            })
        except Exception:
            pass
    return messages


_VIDEO_PATTERNS = [
    (re.compile(r"https?://[a-z0-9.-]*zoom\.us/j/\S+", re.I), "Zoom"),
    (re.compile(r"https?://meet\.google\.com/[a-z0-9-]+", re.I), "Google Meet"),
    (re.compile(r"https?://teams\.microsoft\.com/l/meetup[^\s>\"']+", re.I), "Microsoft Teams"),
    (re.compile(r"https?://[a-z0-9.-]*webex\.com/[^\s>\"']+", re.I), "Webex"),
    (re.compile(r"https?://around\.co/r/\S+", re.I), "Around"),
    (re.compile(r"https?://whereby\.com/[^\s>\"']+", re.I), "Whereby"),
]

def _extract_video_link(text: str) -> tuple[str, str] | None:
    """Return (url, platform) for the first video call link found in text, or None."""
    for pattern, platform in _VIDEO_PATTERNS:
        m = pattern.search(text or "")
        if m:
            url = m.group(0).rstrip(".,;)")
            return url, platform
    return None


def _get_video_calls(args: dict, user_id: str) -> dict:
    """Return upcoming calendar events that contain a video call join link."""
    days = int(args.get("days", 7))
    now = datetime.now()
    today = now.strftime("%Y-%m-%d")
    end_date = (now + timedelta(days=days)).strftime("%Y-%m-%d")

    conn = get_connection()
    events = conn.execute(
        "SELECT id, title, description, event_date FROM events "
        "WHERE user_id=? AND substr(event_date,1,10)>=? AND substr(event_date,1,10)<=? "
        "ORDER BY event_date ASC LIMIT 50",
        (user_id, today, end_date),
    ).fetchall()
    conn.close()

    calls = []
    for e in events:
        combined = f"{e['title'] or ''} {e['description'] or ''}"
        result = _extract_video_link(combined)
        if result:
            join_url, platform = result
            calls.append({
                "title": e["title"],
                "date": e["event_date"][:10] if e["event_date"] else "",
                "time": e["event_date"][11:16] if len(e["event_date"] or "") > 10 else "",
                "platform": platform,
                "join_url": join_url,
                "event_id": e["id"],
            })

    return {
        "status": "ok",
        "days_ahead": days,
        "calls": calls,
        "count": len(calls),
    }


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
