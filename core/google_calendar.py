"""
core/google_calendar.py — Google Calendar sync scaffold.

This module provides the OAuth flow and event push to Google Calendar.
Currently a scaffold — functional code with clear extension points.

Setup:
  1. Create OAuth credentials at console.cloud.google.com
  2. Download credentials.json to project root
  3. Set GOOGLE_CALENDAR_CREDENTIALS and GOOGLE_CALENDAR_TOKEN in .env
  4. Run first sync to trigger OAuth flow

Usage:
    from core.google_calendar import sync_event_to_gcal, is_gcal_configured
    if is_gcal_configured():
        sync_event_to_gcal(event_dict)
"""

from __future__ import annotations

import logging
import os

from config import (
    GOOGLE_CALENDAR_CREDENTIALS,
    GOOGLE_CALENDAR_ID,
    GOOGLE_CALENDAR_TOKEN,
    USE_GOOGLE_CALENDAR,
)

logger = logging.getLogger(__name__)


def is_gcal_configured() -> bool:
    """Check if Google Calendar credentials are available."""
    return USE_GOOGLE_CALENDAR and os.path.exists(GOOGLE_CALENDAR_CREDENTIALS)


def get_gcal_service():
    """
    Build and return a Google Calendar API service object.
    Handles OAuth token refresh automatically.
    """
    if not is_gcal_configured():
        logger.warning("Google Calendar not configured — skipping")
        return None

    try:
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
        from google_auth_oauthlib.flow import InstalledAppFlow
        from googleapiclient.discovery import build

        SCOPES = ["https://www.googleapis.com/auth/calendar.events"]
        creds = None

        if os.path.exists(GOOGLE_CALENDAR_TOKEN):
            creds = Credentials.from_authorized_user_file(GOOGLE_CALENDAR_TOKEN, SCOPES)

        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
            else:
                flow = InstalledAppFlow.from_client_secrets_file(
                    GOOGLE_CALENDAR_CREDENTIALS, SCOPES
                )
                creds = flow.run_local_server(port=0)
            with open(GOOGLE_CALENDAR_TOKEN, "w") as token:
                token.write(creds.to_json())

        return build("calendar", "v3", credentials=creds)

    except ImportError:
        logger.error("Google Calendar libraries not installed. Run: pip install google-auth-oauthlib google-api-python-client")
        return None
    except Exception as exc:
        logger.error("Google Calendar auth failed: %s", exc)
        return None


def sync_event_to_gcal(event: dict) -> dict | None:
    """
    Push an orryon event to Google Calendar.

    Args:
        event: dict with keys: title, event_date, description (optional)

    Returns:
        Google Calendar event resource dict on success, None on failure.
    """
    service = get_gcal_service()
    if not service:
        return None

    try:
        date_str = (event.get("event_date") or "")[:10]
        time_str = (event.get("event_date") or "")[11:16] if len(event.get("event_date", "")) > 10 else ""

        gcal_event: dict = {
            "summary": event.get("title", "Untitled Event"),
            "description": event.get("description", ""),
        }

        if time_str:
            gcal_event["start"] = {"dateTime": f"{date_str}T{time_str}:00", "timeZone": "America/New_York"}
            gcal_event["end"] = {"dateTime": f"{date_str}T{time_str}:00", "timeZone": "America/New_York"}
        else:
            gcal_event["start"] = {"date": date_str}
            gcal_event["end"] = {"date": date_str}

        result = service.events().insert(
            calendarId=GOOGLE_CALENDAR_ID,
            body=gcal_event,
        ).execute()

        logger.info("Event synced to Google Calendar: %s", result.get("id"))
        return result

    except Exception as exc:
        logger.error("Failed to sync event to Google Calendar: %s", exc)
        return None


def list_upcoming_gcal_events(max_results: int = 10) -> list[dict]:
    """Fetch upcoming events from Google Calendar."""
    service = get_gcal_service()
    if not service:
        return []

    try:
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc).isoformat()

        result = service.events().list(
            calendarId=GOOGLE_CALENDAR_ID,
            timeMin=now,
            maxResults=max_results,
            singleEvents=True,
            orderBy="startTime",
        ).execute()

        return result.get("items", [])

    except Exception as exc:
        logger.error("Failed to fetch Google Calendar events: %s", exc)
        return []
