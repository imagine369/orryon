"""
Fulfillment handoff orchestration — location-aware deeplinks, stored for UI + briefing.

Privacy: handoffs are user-owned rows; URLs open external apps (Uber, DoorDash, etc.).
Orryon does not store payment credentials or complete purchases.
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from config import FULFILLMENT_ENABLED, UBER_CLIENT_ID
from core.grocery_list import get_unchecked_grocery_item_names
from core.integrations.fulfillment.cache import get_cached_url, set_cached_url
from core.integrations.fulfillment.deeplinks import action_label_for_type, build_action_url
from db.connection import get_connection
from db.crud import insert_row
from db.location import get_user_places

logger = logging.getLogger(__name__)

VALID_TYPES = frozenset({"ride", "delivery", "grocery", "reservation", "pharmacy"})

_EMPTY_PLACE: dict[str, Any] = {"label": "", "address": "", "lat": None, "lng": None}


def _coords_from_stored(lat: Any, lng: Any) -> tuple[float | None, float | None]:
    """Return lat/lng from DB row; None when unset (default 0,0 placeholder)."""
    if lat is None or lng is None:
        return None, None
    try:
        flat, flng = float(lat), float(lng)
    except (TypeError, ValueError):
        return None, None
    if flat == 0.0 and flng == 0.0:
        return None, None
    return flat, flng


def _first_present_coord(*values: Any) -> float | None:
    for value in values:
        if value is not None:
            return float(value)
    return None


def resolve_user_place(user_id: str, label: str | None) -> dict[str, Any]:
    """Resolve a saved place by exact label (case-insensitive), or treat label as a raw address."""
    if not label:
        return dict(_EMPTY_PLACE)
    normalized = label.strip().lower()
    for place in get_user_places(user_id):
        plabel = (place.get("label") or "").strip().lower()
        if plabel == normalized:
            lat, lng = _coords_from_stored(place.get("lat"), place.get("lng"))
            return {
                "label": place.get("label") or label,
                "address": place.get("address") or "",
                "lat": lat,
                "lng": lng,
            }
    stripped = label.strip()
    return {"label": stripped, "address": stripped, "lat": None, "lng": None}


def _grocery_items_for_user(user_id: str, explicit: list[str] | None) -> list[str]:
    if explicit:
        return [str(i).strip() for i in explicit if str(i).strip()]
    try:
        return get_unchecked_grocery_item_names(user_id)
    except Exception:
        return []


def _fulfillment_url_cache_key(
    handoff_type: str,
    partner_url: str,
    *,
    restaurant_name: str,
    near_address: str,
    lat: float | None,
    lng: float | None,
) -> str:
    """Stable cache key — includes deeplink context, not partner_url alone."""
    normalized_url = partner_url.rstrip("/")[:120]
    name = restaurant_name.strip().lower()[:80]
    addr = near_address.strip().lower()[:80]
    coords = f"{lat},{lng}" if lat is not None and lng is not None else ""
    return f"{handoff_type}:{normalized_url}|{name}|{addr}|{coords}"[:200]


def _build_handoff_row(user_id: str, spec: dict[str, Any]) -> dict[str, Any]:
    handoff_type = str(spec.get("type") or "").strip().lower()
    if handoff_type not in VALID_TYPES:
        raise ValueError(f"Invalid handoff type: {handoff_type}")

    title = str(spec.get("title") or "").strip()
    if not title:
        raise ValueError("title is required")

    pickup = resolve_user_place(user_id, spec.get("pickup_place"))
    destination = resolve_user_place(user_id, spec.get("destination_place"))
    if spec.get("pickup_lat") is not None:
        pickup["lat"] = float(spec["pickup_lat"])
        pickup["lng"] = float(spec["pickup_lng"]) if spec.get("pickup_lng") is not None else None
    if spec.get("dropoff_lat") is not None:
        destination["lat"] = float(spec["dropoff_lat"])
        destination["lng"] = float(spec.get("dropoff_lng")) if spec.get("dropoff_lng") is not None else None
    elif spec.get("destination_lat") is not None:
        destination["lat"] = float(spec["destination_lat"])
        destination["lng"] = (
            float(spec["destination_lng"]) if spec.get("destination_lng") is not None else None
        )
    dest_address = str(spec.get("destination_address") or destination.get("address") or "")
    if dest_address and not destination.get("address"):
        destination["address"] = dest_address

    near_address = destination.get("address") or pickup.get("address") or ""
    partner_url = str(spec.get("partner_url") or "").strip()
    restaurant_name = str(spec.get("restaurant_name") or title)
    lat = _first_present_coord(destination.get("lat"), pickup.get("lat"))
    lng = _first_present_coord(destination.get("lng"), pickup.get("lng"))

    reservation_platform = str(spec.get("reservation_platform") or "").strip().lower()
    reservation_date = str(spec.get("reservation_date") or "").strip()
    reservation_time = str(spec.get("reservation_time") or "").strip()
    party_size = spec.get("party_size")

    cache_key = ""
    action_url = ""
    if partner_url and handoff_type in ("delivery", "reservation"):
        # For reservations, fold platform + date + time + party into the cache key so that
        # the same venue on a different date/platform never returns a stale cached URL.
        cache_partner_url = partner_url
        if handoff_type == "reservation":
            res_suffix = f"|{reservation_platform}|{reservation_date}|{reservation_time}|{party_size}"
            cache_partner_url = partner_url + res_suffix
        cache_key = _fulfillment_url_cache_key(
            handoff_type,
            cache_partner_url,
            restaurant_name=restaurant_name,
            near_address=near_address,
            lat=lat,
            lng=lng,
        )
        cached = get_cached_url(user_id, cache_key)
        if cached:
            action_url = cached

    grocery_items = _grocery_items_for_user(
        user_id,
        spec.get("grocery_items") or spec.get("items"),
    )

    payload: dict[str, Any] = {
        "pickup": pickup,
        "dropoff": destination,
        "partner_url": partner_url,
        "restaurant_name": restaurant_name,
        "grocery_items": grocery_items,
        "items": grocery_items,
        "near_address": near_address,
        "pharmacy_brand": str(spec.get("pharmacy_brand") or "cvs").lower(),
        "medication_name": str(spec.get("medication_name") or ""),
        "lat": lat,
        "lng": lng,
        "title": title,
        "reservation_platform": reservation_platform,
        "reservation_date": reservation_date,
        "reservation_time": reservation_time,
        "party_size": party_size,
    }

    if not action_url:
        action_url = build_action_url(handoff_type, payload, uber_client_id=UBER_CLIENT_ID)
        if cache_key:
            set_cached_url(user_id, cache_key, action_url)

    subtitle = str(spec.get("subtitle") or "").strip()
    if not subtitle:
        if handoff_type == "ride" and destination.get("label"):
            subtitle = f"{pickup.get('label') or 'Pickup'} → {destination.get('label')}"
        elif handoff_type == "grocery" and grocery_items:
            preview = ", ".join(grocery_items[:4])
            if len(grocery_items) > 4:
                preview += f" +{len(grocery_items) - 4} more"
            subtitle = preview
        elif handoff_type == "pharmacy" and spec.get("medication_name"):
            subtitle = str(spec["medication_name"])
        elif near_address:
            subtitle = near_address[:120]

    metadata = {
        "pickup": pickup,
        "destination": destination,
        "grocery_items": grocery_items,
        "pharmacy_brand": payload["pharmacy_brand"],
        "medication_name": payload["medication_name"],
        "notes": str(spec.get("notes") or ""),
    }
    if spec.get("marketing_demo") is True:
        metadata["marketing_demo"] = True

    now = datetime.now(timezone.utc).isoformat()
    row = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": handoff_type,
        "title": title,
        "subtitle": subtitle,
        "action_label": str(
            spec.get("action_label")
            or action_label_for_type(handoff_type, platform=reservation_platform)
        ),
        "action_url": action_url,
        "metadata_json": json.dumps(metadata),
        "status": "pending",
        "created_at": now,
    }
    if not insert_row("fulfillment_handoffs", row):
        raise ValueError("Failed to persist handoff")
    return _public_handoff(row)


def _public_handoff(row: dict) -> dict:
    meta = {}
    try:
        meta = json.loads(row.get("metadata_json") or "{}")
    except json.JSONDecodeError:
        pass
    return {
        "id": row["id"],
        "type": row["type"],
        "title": row["title"],
        "subtitle": row.get("subtitle") or "",
        "action_label": row.get("action_label") or "Open",
        "action_url": row["action_url"],
        "status": row.get("status") or "pending",
        "created_at": row.get("created_at") or "",
        "metadata": meta,
    }


def create_handoffs(user_id: str, specs: list[dict[str, Any]]) -> dict[str, Any]:
    """Create handoffs from specs. Returns created rows and any skipped specs with reasons."""
    if not FULFILLMENT_ENABLED:
        return {"handoffs": [], "skipped": []}
    created: list[dict] = []
    skipped: list[dict[str, str]] = []
    for spec in specs:
        try:
            created.append(_build_handoff_row(user_id, spec))
        except ValueError as exc:
            logger.warning("Skipping handoff for user=%s: %s", user_id, exc)
            skipped.append({
                "title": str(spec.get("title") or "").strip() or "(untitled)",
                "type": str(spec.get("type") or "").strip(),
                "reason": str(exc),
            })
    return {"handoffs": created, "skipped": skipped}


def get_pending_handoffs(user_id: str, limit: int = 20) -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM fulfillment_handoffs WHERE user_id=? AND status='pending' "
            "ORDER BY created_at DESC LIMIT ?",
            (user_id, limit),
        ).fetchall()
    return [_public_handoff(dict(r)) for r in rows]


def dismiss_handoff(user_id: str, handoff_id: str) -> bool:
    """Mark a pending handoff dismissed. Returns False if not found or not pending."""
    try:
        with get_connection() as conn:
            cur = conn.execute(
                "UPDATE fulfillment_handoffs SET status=? "
                "WHERE id=? AND user_id=? AND status='pending'",
                ("dismissed", handoff_id, user_id),
            )
            conn.commit()
            rc = getattr(cur, "rowcount", None)
            return (rc or 0) > 0
    except Exception as exc:
        logger.error("dismiss_handoff error: %s", exc)
        return False
