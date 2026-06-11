"""Google Calendar bidirectional sync (per-user OAuth tokens)."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from config import GOOGLE_CALENDAR_OAUTH_ENABLED
from core.integrations.google_tokens import get_google_tokens, store_google_tokens
from db import get_connection, insert_row, update_row

logger = logging.getLogger(__name__)

GOOGLE_SCOPES = [
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/gmail.readonly",
]


def _credentials_for_user(uid: str):
    """Return refreshed google.oauth2.credentials.Credentials or None."""
    if not GOOGLE_CALENDAR_OAUTH_ENABLED:
        return None
    tokens = get_google_tokens(uid)
    if not tokens:
        return None
    try:
        from google.oauth2.credentials import Credentials
        import google.auth.transport.requests
    except ImportError:
        logger.error("Google auth libraries not installed")
        return None

    creds = Credentials(**tokens)
    if creds.expired and creds.refresh_token:
        creds.refresh(google.auth.transport.requests.Request())
        store_google_tokens(uid, {
            "token": creds.token,
            "refresh_token": creds.refresh_token,
            "token_uri": creds.token_uri,
            "client_id": creds.client_id,
            "client_secret": creds.client_secret,
            "scopes": list(creds.scopes or GOOGLE_SCOPES),
        })
    return creds


def pull_google_events(uid: str) -> int:
    """Pull new events from Google Calendar into Orryon. Returns count inserted."""
    creds = _credentials_for_user(uid)
    if not creds:
        return 0

    try:
        from googleapiclient.discovery import build
    except ImportError:
        logger.error("googleapiclient not installed")
        return 0

    service = build("calendar", "v3", credentials=creds)
    now_iso = datetime.now(timezone.utc).isoformat()
    result = service.events().list(
        calendarId="primary",
        timeMin=now_iso,
        maxResults=250,
        singleEvents=True,
        orderBy="startTime",
    ).execute()

    items = result.get("items", [])
    conn = get_connection()
    existing_ids = {
        row[0]
        for row in conn.execute(
            "SELECT external_uid FROM events WHERE user_id=? AND external_uid IS NOT NULL", (uid,)
        ).fetchall()
    }

    count = 0
    for item in items:
        ext_id = item.get("id", "")
        if not ext_id or ext_id in existing_ids:
            continue

        start = item.get("start", {})
        dtstart = start.get("dateTime", start.get("date", ""))
        if not dtstart:
            continue

        if "T" in dtstart:
            try:
                dt = datetime.fromisoformat(dtstart.replace("Z", "+00:00"))
                dtstart = dt.strftime("%Y-%m-%d %H:%M")
            except Exception:
                pass

        title = item.get("summary", "Untitled event")[:200]
        description = item.get("description", "")[:500]
        location = item.get("location", "")
        if location:
            description = (f"{description}\n📍 {location}" if description else f"📍 {location}")

        insert_row("events", {
            "id": str(uuid.uuid4()),
            "user_id": uid,
            "title": title,
            "description": description,
            "event_date": dtstart[:16],
            "event_type": "event",
            "amount": 0,
            "is_recurring": 0,
            "recurrence": "",
            "is_synced_to_google": 1,
            "reminder_minutes": 30,
            "reminder_sent": 0,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "external_uid": ext_id,
        })
        existing_ids.add(ext_id)
        count += 1

    if count:
        logger.info("Google Calendar pull for user %s: %d new events", uid, count)
    return count


def push_event_to_google(uid: str, event: dict) -> str | None:
    """Push an Orryon event to Google Calendar. Returns Google event id or None."""
    if event.get("external_uid"):
        return event["external_uid"]

    creds = _credentials_for_user(uid)
    if not creds:
        return None

    try:
        from googleapiclient.discovery import build
    except ImportError:
        return None

    date_str = (event.get("event_date") or "")[:10]
    time_str = (event.get("event_date") or "")[11:16] if len(event.get("event_date", "")) > 10 else ""

    body: dict = {
        "summary": event.get("title", "Untitled event"),
        "description": event.get("description", ""),
    }
    if time_str:
        body["start"] = {"dateTime": f"{date_str}T{time_str}:00", "timeZone": "UTC"}
        body["end"] = {"dateTime": f"{date_str}T{time_str}:00", "timeZone": "UTC"}
    else:
        body["start"] = {"date": date_str}
        body["end"] = {"date": date_str}

    try:
        service = build("calendar", "v3", credentials=creds)
        result = service.events().insert(calendarId="primary", body=body).execute()
        ext_id = result.get("id", "")
        if ext_id and event.get("id"):
            update_row(
                "events",
                {"external_uid": ext_id, "is_synced_to_google": 1},
                {"id": event["id"], "user_id": uid},
            )
        return ext_id or None
    except Exception as exc:
        logger.warning("Google Calendar push failed for user %s: %s", uid, exc)
        return None


def sync_all_google_calendars() -> None:
    """Scheduler hook: pull Google events for every connected user."""
    if not GOOGLE_CALENDAR_OAUTH_ENABLED:
        return
    with get_connection() as conn:
        rows = conn.execute("SELECT user_id FROM user_calendar_tokens").fetchall()
    for row in rows:
        uid = row["user_id"] if isinstance(row, dict) else row[0]
        try:
            pull_google_events(uid)
        except Exception as exc:
            logger.warning("Scheduled Google sync failed for %s: %s", uid, exc)
