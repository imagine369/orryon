"""
backend/routers/calendar_sync.py — Calendar sync endpoints.

ICS import (works immediately, no OAuth):
    POST /api/calendar/import/ics       — Upload a .ics file; imports events into the DB.
    GET  /api/calendar/import/status    — Returns count of synced events for the user.

Google Calendar OAuth (requires GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in .env):
    GET  /api/calendar/google/auth      — Redirect user to Google OAuth consent screen.
    GET  /api/calendar/google/callback  — Handle OAuth callback, store tokens, start sync.
    POST /api/calendar/google/sync      — Re-sync events from Google Calendar.
    DELETE /api/calendar/google/disconnect — Remove stored tokens.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import secrets as _secrets
import time
import uuid
from datetime import datetime, timezone, date as date_type

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import RedirectResponse

from backend.auth import get_current_user
from config import (
    APP_URL as CONFIG_APP_URL,
    GOOGLE_CALENDAR_OAUTH_ENABLED,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
)
from db import get_connection, insert_row

router = APIRouter(tags=["calendar"])
logger = logging.getLogger(__name__)


def _require_google_oauth() -> None:
    if not GOOGLE_CALENDAR_OAUTH_ENABLED:
        raise HTTPException(status_code=404, detail="Not found")


# ── Signed OAuth state (CSRF defense) ─────────────────────────────────────────
# State is an HMAC-signed payload containing uid + nonce + issued-at, valid for
# 10 minutes. The server never accepts a raw user_id in the callback.

_OAUTH_STATE_TTL = 600  # seconds


def _oauth_state_secret() -> bytes:
    secret = os.getenv("JWT_SECRET", "")
    if not secret:
        # Lifespan ensures JWT_SECRET is auto-generated in dev; re-read from
        # the auth module's cache so we match its value.
        from backend.auth import _get_secret
        secret = _get_secret()
    return secret.encode("utf-8")


def _sign_oauth_state(uid: str) -> str:
    payload = {"uid": uid, "nonce": _secrets.token_urlsafe(16), "iat": int(time.time())}
    body = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).rstrip(b"=")
    sig = hmac.new(_oauth_state_secret(), body, hashlib.sha256).digest()
    sig_b64 = base64.urlsafe_b64encode(sig).rstrip(b"=")
    return f"{body.decode()}.{sig_b64.decode()}"


def _verify_oauth_state(state: str) -> str:
    """Return the uid embedded in a signed state, or raise HTTPException."""
    try:
        body_s, sig_s = state.split(".", 1)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid state parameter.")

    def _b64decode(s: str) -> bytes:
        pad = "=" * (-len(s) % 4)
        return base64.urlsafe_b64decode(s + pad)

    try:
        body = _b64decode(body_s)
        expected_sig = hmac.new(_oauth_state_secret(), body_s.encode(), hashlib.sha256).digest()
        given_sig = _b64decode(sig_s)
    except Exception:
        raise HTTPException(status_code=400, detail="Malformed state parameter.")

    if not hmac.compare_digest(expected_sig, given_sig):
        raise HTTPException(status_code=400, detail="State signature mismatch.")

    try:
        payload = json.loads(body)
    except Exception:
        raise HTTPException(status_code=400, detail="State payload unreadable.")

    if int(time.time()) - int(payload.get("iat", 0)) > _OAUTH_STATE_TTL:
        raise HTTPException(status_code=400, detail="OAuth state expired — please retry the connect flow.")

    uid = payload.get("uid", "")
    if not uid:
        raise HTTPException(status_code=400, detail="State is missing user id.")
    return uid

# ── Google OAuth config ───────────────────────────────────────────────────────
APP_URL = CONFIG_APP_URL or os.getenv("APP_URL", "http://localhost:3000")
GOOGLE_REDIRECT_URI = f"{APP_URL.rstrip('/')}/api/calendar/google/callback"
GOOGLE_SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _dt_to_iso(dt_val) -> str | None:
    """Convert a vDatetime / vDate / datetime / date to an ISO string the DB expects."""
    if dt_val is None:
        return None
    if hasattr(dt_val, "dt"):
        dt_val = dt_val.dt
    if isinstance(dt_val, datetime):
        return dt_val.strftime("%Y-%m-%d %H:%M")
    if isinstance(dt_val, date_type):
        return dt_val.isoformat()
    return str(dt_val)


def _safe_str(val) -> str:
    """Safely convert an icalendar property to a plain string."""
    if val is None:
        return ""
    if hasattr(val, "to_ical"):
        return val.to_ical().decode("utf-8", errors="replace")
    return str(val)


def _store_google_tokens(uid: str, tokens: dict):
    now = datetime.now(timezone.utc).isoformat()
    payload = json.dumps(tokens)
    with get_connection() as conn:
        existing = conn.execute(
            "SELECT id FROM user_calendar_tokens WHERE user_id=?", (uid,)
        ).fetchone()
        if existing:
            conn.execute(
                "UPDATE user_calendar_tokens SET tokens=?, updated_at=? WHERE user_id=?",
                (payload, now, uid),
            )
        else:
            conn.execute(
                "INSERT INTO user_calendar_tokens (id, user_id, tokens, created_at, updated_at) VALUES (?,?,?,?,?)",
                (str(uuid.uuid4()), uid, payload, now, now),
            )
        conn.commit()


def _get_google_tokens(uid: str) -> dict | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT tokens FROM user_calendar_tokens WHERE user_id=?", (uid,)
        ).fetchone()
    if not row:
        return None
    return json.loads(row["tokens"])


def _ensure_token_table():
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS user_calendar_tokens (
                id         TEXT PRIMARY KEY,
                user_id    TEXT NOT NULL UNIQUE,
                tokens     TEXT NOT NULL,
                created_at TEXT,
                updated_at TEXT
            )
        """)
        conn.commit()


_ensure_token_table()


# ── ICS Import ────────────────────────────────────────────────────────────────

@router.post("/api/calendar/import/ics")
async def import_ics(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """
    Upload a .ics file (exported from Google Calendar, Apple Calendar, Outlook, etc.)
    and import future + recent events into the user's orryon calendar.
    """
    try:
        from icalendar import Calendar
    except ImportError:
        raise HTTPException(status_code=500, detail="ICS parser not available. Run: pip install icalendar")

    if not file.filename or not file.filename.lower().endswith(".ics"):
        raise HTTPException(status_code=422, detail="Please upload a .ics file.")

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:  # 10 MB cap
        raise HTTPException(status_code=413, detail="File too large (max 10 MB).")

    try:
        cal = Calendar.from_ical(content)
    except Exception as exc:
        logger.error("ICS parse error: %s", exc)
        raise HTTPException(status_code=422, detail="Could not parse the .ics file. Make sure it's a valid calendar export.")

    uid = user["user_id"]
    with get_connection() as conn:
        # Collect existing external_uid values to avoid duplicates
        existing_ids = {
            row[0]
            for row in conn.execute(
                "SELECT external_uid FROM events WHERE user_id=? AND external_uid IS NOT NULL", (uid,)
            ).fetchall()
        }

    cutoff = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    cutoff_naive = cutoff.replace(tzinfo=None)

    imported = 0
    skipped  = 0

    for component in cal.walk():
        if component.name != "VEVENT":
            continue

        external_uid = _safe_str(component.get("UID")) or str(uuid.uuid4())
        if external_uid in existing_ids:
            skipped += 1
            continue

        dtstart = _dt_to_iso(component.get("DTSTART"))
        if not dtstart:
            continue

        # Skip events more than 30 days in the past
        try:
            start_dt_raw = component.get("DTSTART")
            if hasattr(start_dt_raw, "dt"):
                start_raw = start_dt_raw.dt
            else:
                start_raw = start_dt_raw

            if isinstance(start_raw, datetime):
                start_cmp = start_raw.replace(tzinfo=None) if start_raw.tzinfo else start_raw
                if start_cmp < cutoff_naive.replace(day=cutoff_naive.day - min(cutoff_naive.day - 1, 30)):
                    skipped += 1
                    continue
            elif isinstance(start_raw, date_type):
                import datetime as dt_mod
                thirty_days_ago = (cutoff_naive - dt_mod.timedelta(days=30)).date()
                if start_raw < thirty_days_ago:
                    skipped += 1
                    continue
        except Exception:
            pass  # If we can't compare, import anyway

        title       = _safe_str(component.get("SUMMARY")) or "Untitled event"
        description = _safe_str(component.get("DESCRIPTION")) or ""
        location    = _safe_str(component.get("LOCATION")) or ""
        if location and description:
            description = f"{description}\n📍 {location}"
        elif location:
            description = f"📍 {location}"

        evt_id = str(uuid.uuid4())
        try:
            insert_row("events", {
                "id":                evt_id,
                "user_id":           uid,
                "title":             title[:200],
                "description":       description[:500],
                "event_date":        dtstart,
                "event_type":        "event",
                "amount":            0,
                "is_recurring":      0,
                "recurrence":        "",
                "is_synced_to_google": 1,
                "reminder_minutes":  30,
                "reminder_sent":     0,
                "created_at":        datetime.now(timezone.utc).isoformat(),
                "external_uid":      external_uid,
            })
            existing_ids.add(external_uid)
            imported += 1
        except Exception as exc:
            logger.warning("Failed to insert event '%s': %s", title, exc)

    logger.info("ICS import for user %s: %d imported, %d skipped", uid, imported, skipped)
    return {
        "imported": imported,
        "skipped":  skipped,
        "message":  f"Imported {imported} event{'s' if imported != 1 else ''}."
                    + (f" {skipped} skipped (duplicates or old)." if skipped else ""),
    }


@router.get("/api/calendar/import/status")
async def import_status(user: dict = Depends(get_current_user)):
    """Return the number of externally-synced events for this user."""
    uid = user["user_id"]
    with get_connection() as conn:
        row = conn.execute(
            "SELECT COUNT(*) FROM events WHERE user_id=? AND is_synced_to_google=1", (uid,)
        ).fetchone()
    return {"synced_count": row[0] if row else 0}


# ── Google Calendar OAuth ─────────────────────────────────────────────────────

@router.get("/api/calendar/google/auth")
async def google_auth(request: Request, token: str = ""):
    """
    Redirect the user to Google's OAuth 2.0 consent screen.
    Accepts the JWT as a ?token= query param because this is a browser redirect
    (cannot send Authorization headers from a link click).
    """
    _require_google_oauth()

    # Validate the JWT and extract user_id
    import jwt as pyjwt
    jwt_secret = os.getenv("JWT_SECRET", "")
    if not token or not jwt_secret:
        raise HTTPException(status_code=401, detail="Missing or invalid token.")
    try:
        payload = pyjwt.decode(token, jwt_secret, algorithms=["HS256"])
        uid = payload.get("user_id") or payload.get("sub", "")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token.")

    try:
        from google_auth_oauthlib.flow import Flow
    except ImportError:
        raise HTTPException(status_code=500, detail="Google auth library not available.")

    flow = Flow.from_client_config(
        {
            "web": {
                "client_id":     GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "auth_uri":      "https://accounts.google.com/o/oauth2/auth",
                "token_uri":     "https://oauth2.googleapis.com/token",
                "redirect_uris": [GOOGLE_REDIRECT_URI],
            }
        },
        scopes=GOOGLE_SCOPES,
        redirect_uri=GOOGLE_REDIRECT_URI,
    )
    signed_state = _sign_oauth_state(uid)
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=signed_state,
    )
    return RedirectResponse(auth_url)


@router.get("/api/calendar/google/callback")
async def google_callback(code: str, state: str, request: Request):
    """Handle Google's OAuth callback, store tokens, and sync events."""
    _require_google_oauth()

    try:
        from google_auth_oauthlib.flow import Flow
        from googleapiclient.discovery import build
    except ImportError:
        raise HTTPException(status_code=500, detail="Google auth library not available.")

    uid = _verify_oauth_state(state)

    flow = Flow.from_client_config(
        {
            "web": {
                "client_id":     GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "auth_uri":      "https://accounts.google.com/o/oauth2/auth",
                "token_uri":     "https://oauth2.googleapis.com/token",
                "redirect_uris": [GOOGLE_REDIRECT_URI],
            }
        },
        scopes=GOOGLE_SCOPES,
        redirect_uri=GOOGLE_REDIRECT_URI,
        state=state,
    )
    flow.fetch_token(code=code)
    creds = flow.credentials
    tokens = {
        "token":         creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri":     creds.token_uri,
        "client_id":     creds.client_id,
        "client_secret": creds.client_secret,
        "scopes":        list(creds.scopes or GOOGLE_SCOPES),
    }
    _store_google_tokens(uid, tokens)

    # Sync events right away
    _sync_google_events(uid, creds)

    frontend = os.getenv("FRONTEND_URL", APP_URL).rstrip("/")
    return RedirectResponse(f"{frontend}/home?calendar_connected=1")


@router.post("/api/calendar/google/sync")
async def google_sync(user: dict = Depends(get_current_user)):
    """Re-fetch events from Google Calendar and upsert into the DB."""
    _require_google_oauth()

    uid    = user["user_id"]
    tokens = _get_google_tokens(uid)
    if not tokens:
        raise HTTPException(status_code=400, detail="Google Calendar not connected.")

    try:
        from google.oauth2.credentials import Credentials
    except ImportError:
        raise HTTPException(status_code=500, detail="Google auth library not available.")

    creds = Credentials(**tokens)
    count = _sync_google_events(uid, creds)
    return {"synced": count, "message": f"Synced {count} event{'s' if count != 1 else ''} from Google Calendar."}


@router.delete("/api/calendar/google/disconnect")
async def google_disconnect(user: dict = Depends(get_current_user)):
    """Remove stored Google tokens for this user."""
    _require_google_oauth()
    uid  = user["user_id"]
    with get_connection() as conn:
        conn.execute("DELETE FROM user_calendar_tokens WHERE user_id=?", (uid,))
        conn.commit()
    return {"disconnected": True}


@router.get("/api/calendar/google/status")
async def google_status(user: dict = Depends(get_current_user)):
    """Check if Google Calendar OAuth is active for this user."""
    uid = user["user_id"]
    tokens = _get_google_tokens(uid)
    conn = get_connection()
    row = conn.execute(
        "SELECT COUNT(*) FROM events WHERE user_id=? AND is_synced_to_google=1", (uid,)
    ).fetchone()
    imported_count = row[0] if row else 0
    oauth_on = GOOGLE_CALENDAR_OAUTH_ENABLED
    has_tokens = tokens is not None
    # connected only when the user can actually sync/disconnect in the UI.
    return {
        "oauth_available": oauth_on,
        "connected": oauth_on and has_tokens,
        "sync_paused": not oauth_on and has_tokens,
        "synced_count": imported_count,
    }


# ── Google sync helper ────────────────────────────────────────────────────────

def _sync_google_events(uid: str, creds) -> int:
    """Fetch upcoming events from Google Calendar and upsert into the DB."""
    try:
        from googleapiclient.discovery import build
        import google.auth.transport.requests

        # Refresh token if expired
        if hasattr(creds, "expired") and creds.expired and creds.refresh_token:
            creds.refresh(google.auth.transport.requests.Request())
            tokens = {
                "token":         creds.token,
                "refresh_token": creds.refresh_token,
                "token_uri":     creds.token_uri,
                "client_id":     creds.client_id,
                "client_secret": creds.client_secret,
                "scopes":        list(creds.scopes or GOOGLE_SCOPES),
            }
            _store_google_tokens(uid, tokens)

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
        conn  = get_connection()
        existing_ids = {
            row[0]
            for row in conn.execute(
                "SELECT external_uid FROM events WHERE user_id=? AND external_uid IS NOT NULL", (uid,)
            ).fetchall()
        }

        count = 0
        for item in items:
            ext_id = item.get("id", "")
            if ext_id in existing_ids:
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

            title       = item.get("summary", "Untitled event")[:200]
            description = item.get("description", "")[:500]
            location    = item.get("location", "")
            if location:
                description = (f"{description}\n📍 {location}" if description else f"📍 {location}")

            insert_row("events", {
                "id":                str(uuid.uuid4()),
                "user_id":           uid,
                "title":             title,
                "description":       description,
                "event_date":        dtstart[:16],
                "event_type":        "event",
                "amount":            0,
                "is_recurring":      0,
                "recurrence":        "",
                "is_synced_to_google": 1,
                "reminder_minutes":  30,
                "reminder_sent":     0,
                "created_at":        datetime.now(timezone.utc).isoformat(),
                "external_uid":      ext_id,
            })
            existing_ids.add(ext_id)
            count += 1

        logger.info("Google Calendar sync for user %s: %d new events", uid, count)
        return count
    except Exception as exc:
        logger.error("Google Calendar sync failed for user %s: %s", uid, exc)
        raise HTTPException(status_code=500, detail=f"Google Calendar sync failed: {exc}")
