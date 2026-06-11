"""HTTP API tests for calendar events."""
from __future__ import annotations

from starlette.testclient import TestClient

from backend.auth import create_token
from backend.main import app
from core.tools.handlers.calendar import _add_calendar_event
from db import get_connection
from db.auth import get_or_create_user_by_email

_DEV_ORIGIN = "http://localhost:3000"


def _headers(email: str) -> dict[str, str]:
    user = get_or_create_user_by_email(email)
    token = create_token(user["id"], user["email"], device_name="pytest", ip_address="127.0.0.1")
    return {"Authorization": f"Bearer {token}", "Origin": _DEV_ORIGIN}


def _reset_events(uid: str) -> None:
    conn = get_connection()
    conn.execute("DELETE FROM events WHERE user_id=?", (uid,))
    conn.commit()
    conn.close()


def test_upcoming_events_includes_timed_events_today():
    email = "pytest-events-upcoming@orryon.app"
    user = get_or_create_user_by_email(email)
    uid = user["id"]
    headers = _headers(email)
    _reset_events(uid)

    result = _add_calendar_event(
        {"title": "Dentist", "date": "2099-06-15", "time": "14:30"},
        uid,
    )
    assert result["status"] == "ok"

    with TestClient(app) as client:
        rows = client.get("/api/events?upcoming=true&limit=50", headers=headers).json()
        titles = [row["title"] for row in rows]
        assert "Dentist" in titles
