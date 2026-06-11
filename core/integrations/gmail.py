"""Gmail read-only integration (per-user OAuth tokens shared with Calendar)."""

from __future__ import annotations

import logging
from typing import Any

from config import GOOGLE_GMAIL_ENABLED
from core.integrations.google_tokens import get_google_tokens, store_google_tokens

logger = logging.getLogger(__name__)

_GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]


def _credentials_for_user(uid: str):
    """Return refreshed google.oauth2.credentials.Credentials or None."""
    if not GOOGLE_GMAIL_ENABLED:
        return None
    tokens = get_google_tokens(uid)
    if not tokens:
        return None

    granted = tokens.get("scopes", [])
    if not any("gmail" in s for s in granted):
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
            "scopes": list(creds.scopes or granted),
        })
    return creds


def fetch_gmail_messages(uid: str, max_results: int = 20) -> list[dict[str, Any]]:
    """
    Fetch recent Gmail messages for the user.

    Returns a list of message dicts with keys:
        id, thread_id, subject, from, date, snippet, labels
    """
    creds = _credentials_for_user(uid)
    if not creds:
        return []

    try:
        from googleapiclient.discovery import build
    except ImportError:
        logger.error("googleapiclient not installed")
        return []

    service = build("gmail", "v1", credentials=creds)

    list_result = service.users().messages().list(
        userId="me",
        maxResults=max_results,
        labelIds=["INBOX"],
    ).execute()

    message_refs = list_result.get("messages", [])
    if not message_refs:
        return []

    messages: list[dict[str, Any]] = []
    for ref in message_refs:
        try:
            msg = service.users().messages().get(
                userId="me",
                id=ref["id"],
                format="metadata",
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
        except Exception as exc:
            logger.warning("Failed to fetch Gmail message %s for user %s: %s", ref["id"], uid, exc)

    return messages


def get_gmail_profile(uid: str) -> dict[str, Any] | None:
    """Return the Gmail profile (email address, message count) for the user."""
    creds = _credentials_for_user(uid)
    if not creds:
        return None

    try:
        from googleapiclient.discovery import build
    except ImportError:
        return None

    service = build("gmail", "v1", credentials=creds)
    try:
        return service.users().getProfile(userId="me").execute()
    except Exception as exc:
        logger.warning("Failed to fetch Gmail profile for user %s: %s", uid, exc)
        return None
