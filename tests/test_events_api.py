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


def test_patch_event_updates_fields():
    email = "pytest-events-patch@orryon.app"
    user = get_or_create_user_by_email(email)
    uid = user["id"]
    headers = _headers(email)
    _reset_events(uid)

    result = _add_calendar_event(
        {"title": "Team lunch", "date": "2099-07-01", "time": "12:00", "description": "Old note"},
        uid,
    )
    assert result["status"] == "ok"
    event_id = result["id"]

    with TestClient(app) as client:
        res = client.patch(
            f"/api/events/{event_id}",
            json={
                "title": "Team dinner",
                "date": "2099-07-02",
                "time": "18:30",
                "description": "Updated note",
            },
            headers=headers,
        )
        assert res.status_code == 200
        assert res.json()["updated"] is True

        rows = client.get("/api/events?upcoming=true&limit=50", headers=headers).json()
        updated = next(r for r in rows if r["id"] == event_id)
        assert updated["title"] == "Team dinner"
        assert updated["event_date"] == "2099-07-02 18:30"
        assert updated["description"] == "Updated note"


def test_patch_event_all_day_clears_time():
    email = "pytest-events-allday@orryon.app"
    user = get_or_create_user_by_email(email)
    uid = user["id"]
    headers = _headers(email)
    _reset_events(uid)

    result = _add_calendar_event(
        {"title": "Meeting", "date": "2099-08-01", "time": "09:00"},
        uid,
    )
    event_id = result["id"]

    with TestClient(app) as client:
        res = client.patch(
            f"/api/events/{event_id}",
            json={"time": ""},
            headers=headers,
        )
        assert res.status_code == 200

        rows = client.get("/api/events?upcoming=true&limit=50", headers=headers).json()
        updated = next(r for r in rows if r["id"] == event_id)
        assert updated["event_date"] == "2099-08-01"


def test_list_events_by_date_range_includes_past_dates():
    email = "pytest-events-range@orryon.app"
    user = get_or_create_user_by_email(email)
    uid = user["id"]
    headers = _headers(email)
    _reset_events(uid)

    _add_calendar_event({"title": "Past event", "date": "2099-05-10"}, uid)
    _add_calendar_event({"title": "Future event", "date": "2099-05-20"}, uid)
    _add_calendar_event({"title": "Other month", "date": "2099-06-01"}, uid)

    with TestClient(app) as client:
        rows = client.get(
            "/api/events?from_date=2099-05-01&to_date=2099-05-31&limit=50",
            headers=headers,
        ).json()
        titles = {row["title"] for row in rows}
        assert titles == {"Past event", "Future event"}


def test_patch_event_rejects_empty_title():
    email = "pytest-events-empty-title@orryon.app"
    user = get_or_create_user_by_email(email)
    uid = user["id"]
    headers = _headers(email)
    _reset_events(uid)

    result = _add_calendar_event({"title": "Keep me", "date": "2099-09-01"}, uid)
    event_id = result["id"]

    with TestClient(app) as client:
        res = client.patch(
            f"/api/events/{event_id}",
            json={"title": "   "},
            headers=headers,
        )
        assert res.status_code == 422
