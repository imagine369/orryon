"""Tool handlers — health vitals, medications, appointments."""
from __future__ import annotations

from db.health import (
    add_health_appointment,
    add_health_vital,
    add_medication,
    get_health_appointments,
    get_health_vitals,
    get_medications,
)


def _log_health_vital(args: dict, user_id: str) -> dict:
    row = add_health_vital(
        user_id,
        vital_type=args["type"],
        value=float(args["value"]),
        unit=args.get("unit", ""),
        note=args.get("note", ""),
        recorded_at=args.get("recorded_at", ""),
    )
    return {
        "status": "ok",
        "id": row["id"],
        "type": row["type"],
        "value": row["value"],
        "unit": row.get("unit", ""),
    }


def _get_health_vitals(args: dict, user_id: str) -> dict:
    rows = get_health_vitals(
        user_id,
        vital_type=args.get("type") or None,
        limit=int(args.get("limit", 20)),
    )
    return {"vitals": rows, "count": len(rows)}


def _log_medication(args: dict, user_id: str) -> dict:
    row = add_medication(
        user_id,
        name=args["name"],
        dose=args.get("dose", ""),
        frequency=args.get("frequency", "daily"),
        next_dose_at=args.get("next_dose_at", ""),
        notes=args.get("notes", ""),
    )
    return {"status": "ok", "id": row["id"], "name": row["name"]}


def _get_medications(args: dict, user_id: str) -> dict:
    active_only = args.get("active_only", True)
    if isinstance(active_only, str):
        active_only = active_only.lower() not in ("false", "0", "no")
    rows = get_medications(user_id, active_only=bool(active_only))
    return {"medications": rows, "count": len(rows)}


def _add_health_appointment(args: dict, user_id: str) -> dict:
    row = add_health_appointment(
        user_id,
        appt_type=args.get("type", ""),
        provider=args.get("provider", ""),
        date=args.get("date", ""),
        location=args.get("location", ""),
        notes=args.get("notes", ""),
    )
    return {
        "status": "ok",
        "id": row["id"],
        "provider": row.get("provider", ""),
        "date": row.get("date", ""),
    }


def _get_health_appointments(args: dict, user_id: str) -> dict:
    upcoming = args.get("upcoming_only", True)
    if isinstance(upcoming, str):
        upcoming = upcoming.lower() not in ("false", "0", "no")
    rows = get_health_appointments(user_id, upcoming_only=bool(upcoming))
    return {"appointments": rows, "count": len(rows)}
