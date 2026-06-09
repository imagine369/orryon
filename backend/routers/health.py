"""
backend/routers/health.py — Health vitals, medications, and appointments.

All routes require an active (paid) plan.

Vitals:
  POST   /api/health/vitals
  GET    /api/health/vitals?type=&limit=
  DELETE /api/health/vitals/{id}

Medications:
  POST   /api/health/medications
  GET    /api/health/medications
  PATCH  /api/health/medications/{id}
  DELETE /api/health/medications/{id}

Appointments:
  POST   /api/health/appointments
  GET    /api/health/appointments?upcoming=true
  DELETE /api/health/appointments/{id}
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from backend.auth import get_current_user
from backend.deps import require_active_plan
from db.health import (
    add_health_appointment,
    add_health_vital,
    add_medication,
    delete_health_appointment,
    delete_health_vital,
    delete_medication,
    get_health_appointments,
    get_health_vitals,
    get_medications,
    update_medication,
)

router = APIRouter(tags=["health"], dependencies=[Depends(require_active_plan)])


# ── Vitals ────────────────────────────────────────────────────────────────────

class VitalReq(BaseModel):
    type: str           # e.g. weight, blood_pressure, glucose, sleep, steps, mood
    value: float
    unit: str = ""
    note: str = ""
    recorded_at: str = ""
    source: str = "manual"


@router.post("/api/health/vitals")
async def log_vital(body: VitalReq, user: dict = Depends(get_current_user)):
    if not body.type:
        raise HTTPException(400, "Vital type is required")
    row = add_health_vital(
        user_id=user["user_id"],
        vital_type=body.type,
        value=body.value,
        unit=body.unit,
        note=body.note,
        recorded_at=body.recorded_at,
        source=body.source,
    )
    return row


@router.get("/api/health/vitals")
async def list_vitals(
    type: str = Query(""),
    limit: int = Query(50, le=200),
    user: dict = Depends(get_current_user),
):
    rows = get_health_vitals(user["user_id"], vital_type=type or None, limit=limit)
    return {"vitals": rows}


@router.delete("/api/health/vitals/{vital_id}")
async def remove_vital(vital_id: str, user: dict = Depends(get_current_user)):
    ok = delete_health_vital(user["user_id"], vital_id)
    if not ok:
        raise HTTPException(404, "Vital not found")
    return {"deleted": True}


# ── Medications ───────────────────────────────────────────────────────────────

class MedReq(BaseModel):
    name: str
    dose: str = ""
    frequency: str = "daily"
    next_dose_at: str = ""
    notes: str = ""


class MedPatch(BaseModel):
    name: str | None = None
    dose: str | None = None
    frequency: str | None = None
    next_dose_at: str | None = None
    notes: str | None = None
    active: int | None = None


@router.post("/api/health/medications")
async def create_medication(body: MedReq, user: dict = Depends(get_current_user)):
    if not body.name.strip():
        raise HTTPException(400, "Medication name is required")
    row = add_medication(
        user_id=user["user_id"],
        name=body.name.strip(),
        dose=body.dose,
        frequency=body.frequency,
        next_dose_at=body.next_dose_at,
        notes=body.notes,
    )
    return row


@router.get("/api/health/medications")
async def list_medications(
    active_only: bool = Query(True),
    user: dict = Depends(get_current_user),
):
    rows = get_medications(user["user_id"], active_only=active_only)
    return {"medications": rows}


@router.patch("/api/health/medications/{med_id}")
async def patch_medication(
    med_id: str, body: MedPatch, user: dict = Depends(get_current_user)
):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "Nothing to update")
    ok = update_medication(user["user_id"], med_id, updates)
    if not ok:
        raise HTTPException(404, "Medication not found")
    return {"updated": True}


@router.delete("/api/health/medications/{med_id}")
async def remove_medication(med_id: str, user: dict = Depends(get_current_user)):
    ok = delete_medication(user["user_id"], med_id)
    if not ok:
        raise HTTPException(404, "Medication not found")
    return {"deleted": True}


# ── Appointments ──────────────────────────────────────────────────────────────

class ApptReq(BaseModel):
    type: str = ""
    provider: str = ""
    date: str
    location: str = ""
    notes: str = ""


@router.post("/api/health/appointments")
async def create_appointment(body: ApptReq, user: dict = Depends(get_current_user)):
    if not body.date:
        raise HTTPException(400, "Date is required")
    row = add_health_appointment(
        user_id=user["user_id"],
        appt_type=body.type,
        provider=body.provider,
        date=body.date,
        location=body.location,
        notes=body.notes,
    )
    return row


@router.get("/api/health/appointments")
async def list_appointments(
    upcoming: bool = Query(False),
    user: dict = Depends(get_current_user),
):
    rows = get_health_appointments(user["user_id"], upcoming_only=upcoming)
    return {"appointments": rows}


@router.delete("/api/health/appointments/{appt_id}")
async def remove_appointment(appt_id: str, user: dict = Depends(get_current_user)):
    ok = delete_health_appointment(user["user_id"], appt_id)
    if not ok:
        raise HTTPException(404, "Appointment not found")
    return {"deleted": True}
