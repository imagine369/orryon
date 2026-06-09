"""
backend/routers/location.py — User-defined places and commute patterns.

Privacy-first: no live GPS tracking. Users manually save named places.

GET    /api/location/places
POST   /api/location/places
DELETE /api/location/places/{id}
GET    /api/location/commute
POST   /api/location/commute
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.auth import get_current_user
from backend.deps import require_active_plan
from db.location import (
    add_user_place,
    delete_user_place,
    get_commute_pattern,
    get_user_places,
    upsert_commute_pattern,
)

router = APIRouter(tags=["location"], dependencies=[Depends(require_active_plan)])


class PlaceReq(BaseModel):
    label: str          # e.g. "Home", "Work", "Gym"
    address: str = ""
    lat: float = 0
    lng: float = 0


class CommuteReq(BaseModel):
    from_place: str     # label of origin place
    to_place: str       # label of destination place
    days: str           # comma-separated: "Mon,Tue,Wed,Thu,Fri"
    depart_time: str    # "08:30"


@router.get("/api/location/places")
async def list_places(user: dict = Depends(get_current_user)):
    return {"places": get_user_places(user["user_id"])}


@router.post("/api/location/places")
async def create_place(body: PlaceReq, user: dict = Depends(get_current_user)):
    if not body.label.strip():
        raise HTTPException(400, "Label is required")
    existing = get_user_places(user["user_id"])
    if len(existing) >= 10:
        raise HTTPException(400, "Maximum of 10 places allowed")
    row = add_user_place(
        user_id=user["user_id"],
        label=body.label.strip(),
        address=body.address,
        lat=body.lat,
        lng=body.lng,
    )
    return row


@router.delete("/api/location/places/{place_id}")
async def remove_place(place_id: str, user: dict = Depends(get_current_user)):
    ok = delete_user_place(user["user_id"], place_id)
    if not ok:
        raise HTTPException(404, "Place not found")
    return {"deleted": True}


@router.get("/api/location/commute")
async def get_commute(user: dict = Depends(get_current_user)):
    pattern = get_commute_pattern(user["user_id"])
    return {"commute": pattern}


@router.post("/api/location/commute")
async def save_commute(body: CommuteReq, user: dict = Depends(get_current_user)):
    if not body.from_place or not body.to_place:
        raise HTTPException(400, "from_place and to_place are required")
    row = upsert_commute_pattern(
        user_id=user["user_id"],
        from_place=body.from_place,
        to_place=body.to_place,
        days=body.days,
        depart_time=body.depart_time,
    )
    return row
