"""
db.health — Vitals, medications, and appointments.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from db.connection import get_connection
from db.crud import insert_row

logger = logging.getLogger(__name__)


def add_health_vital(user_id: str, vital_type: str, value: float, unit: str = "",
                     note: str = "", recorded_at: str = "", source: str = "manual") -> dict:
    now = datetime.now(timezone.utc).isoformat()
    row = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": vital_type,
        "value": value,
        "unit": unit,
        "note": note,
        "source": source,
        "recorded_at": recorded_at or now,
        "created_at": now,
    }
    insert_row("health_vitals", row)
    return row


def get_health_vitals(user_id: str, vital_type: str | None = None,
                      limit: int = 50) -> list[dict]:
    try:
        conn = get_connection()
        if vital_type:
            rows = conn.execute(
                "SELECT * FROM health_vitals WHERE user_id=? AND type=? ORDER BY recorded_at DESC LIMIT ?",
                (user_id, vital_type, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM health_vitals WHERE user_id=? ORDER BY recorded_at DESC LIMIT ?",
                (user_id, limit),
            ).fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as exc:
        logger.error("get_health_vitals error: %s", exc)
        return []


def delete_health_vital(user_id: str, vital_id: str) -> bool:
    try:
        conn = get_connection()
        conn.execute("DELETE FROM health_vitals WHERE id=? AND user_id=?", (vital_id, user_id))
        conn.commit()
        conn.close()
        return True
    except Exception as exc:
        logger.error("delete_health_vital error: %s", exc)
        return False


# ── Medications ───────────────────────────────────────────────────────────────

def add_medication(user_id: str, name: str, dose: str = "", frequency: str = "daily",
                   next_dose_at: str = "", notes: str = "") -> dict:
    now = datetime.now(timezone.utc).isoformat()
    row = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "name": name,
        "dose": dose,
        "frequency": frequency,
        "next_dose_at": next_dose_at,
        "notes": notes,
        "active": 1,
        "created_at": now,
    }
    insert_row("medications", row)
    return row


def get_medications(user_id: str, active_only: bool = True) -> list[dict]:
    try:
        conn = get_connection()
        q = "SELECT * FROM medications WHERE user_id=?"
        params: list = [user_id]
        if active_only:
            q += " AND active=1"
        q += " ORDER BY name"
        rows = conn.execute(q, params).fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as exc:
        logger.error("get_medications error: %s", exc)
        return []


def update_medication(user_id: str, med_id: str, updates: dict) -> bool:
    allowed = {"name", "dose", "frequency", "next_dose_at", "notes", "active"}
    filtered = {k: v for k, v in updates.items() if k in allowed}
    if not filtered:
        return False
    try:
        conn = get_connection()
        sets = ", ".join(f"{k}=?" for k in filtered)
        conn.execute(f"UPDATE medications SET {sets} WHERE id=? AND user_id=?",
                     (*filtered.values(), med_id, user_id))
        conn.commit()
        conn.close()
        return True
    except Exception as exc:
        logger.error("update_medication error: %s", exc)
        return False


def delete_medication(user_id: str, med_id: str) -> bool:
    try:
        conn = get_connection()
        conn.execute("UPDATE medications SET active=0 WHERE id=? AND user_id=?", (med_id, user_id))
        conn.commit()
        conn.close()
        return True
    except Exception as exc:
        logger.error("delete_medication error: %s", exc)
        return False


# ── Health appointments ───────────────────────────────────────────────────────

def add_health_appointment(user_id: str, appt_type: str = "", provider: str = "",
                            date: str = "", location: str = "", notes: str = "") -> dict:
    now = datetime.now(timezone.utc).isoformat()
    row = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": appt_type,
        "provider": provider,
        "date": date,
        "location": location,
        "notes": notes,
        "created_at": now,
    }
    insert_row("health_appointments", row)
    return row


def get_health_appointments(user_id: str, upcoming_only: bool = False) -> list[dict]:
    try:
        conn = get_connection()
        if upcoming_only:
            today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            rows = conn.execute(
                "SELECT * FROM health_appointments WHERE user_id=? AND date>=? ORDER BY date",
                (user_id, today),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM health_appointments WHERE user_id=? ORDER BY date DESC LIMIT 50",
                (user_id,),
            ).fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as exc:
        logger.error("get_health_appointments error: %s", exc)
        return []


def delete_health_appointment(user_id: str, appt_id: str) -> bool:
    try:
        conn = get_connection()
        conn.execute("DELETE FROM health_appointments WHERE id=? AND user_id=?", (appt_id, user_id))
        conn.commit()
        conn.close()
        return True
    except Exception as exc:
        logger.error("delete_health_appointment error: %s", exc)
        return False


# ── User places / location ────────────────────────────────────────────────────
