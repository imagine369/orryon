"""
Marketing demo handoffs — seed sample errands for screenshots (no chat required).

Privacy: demo rows are tagged metadata.marketing_demo=true and only auto-seeded when
ENABLE_DEMO is on (local dev). Never runs in production.
"""
from __future__ import annotations

import logging
from typing import Any

from config import FULFILLMENT_ENABLED
from core.integrations.fulfillment.handoff import create_handoffs, get_pending_handoffs
from db.connection import get_connection

logger = logging.getLogger(__name__)

# Stable marketing copy for Errands tab screenshots.
MARKETING_HANDOFF_SPECS: list[dict[str, Any]] = [
    {
        "type": "ride",
        "title": "Uber to Osteria Mozza",
        "subtitle": "Home → dinner reservation · 6:40 PM",
        "pickup_lat": 34.0522,
        "pickup_lng": -118.2437,
        "dropoff_lat": 34.0834,
        "dropoff_lng": -118.3618,
        "pickup_place": "Home",
        "destination_address": "Osteria Mozza",
        "marketing_demo": True,
    },
    {
        "type": "pharmacy",
        "title": "CVS pickup — Lisinopril",
        "subtitle": "Refill ready · 0.9 mi from Home",
        "pharmacy_brand": "cvs",
        "medication_name": "Lisinopril",
        "destination_place": "Home",
        "marketing_demo": True,
    },
    {
        "type": "grocery",
        "title": "Grocery run",
        "subtitle": "milk, eggs, bread, butter",
        "grocery_items": ["milk", "eggs", "bread", "butter"],
        "destination_place": "Home",
        "marketing_demo": True,
    },
    {
        "type": "delivery",
        "title": "Thai Basil",
        "subtitle": "Pad thai · deliver to Home · est. 35 min",
        "restaurant_name": "Thai Basil",
        "partner_url": "https://www.doordash.com/",
        "marketing_demo": True,
    },
    {
        "type": "reservation",
        "title": "Italian near Home",
        "subtitle": "Party of 2 · Sat 7:00 PM · OpenTable",
        "restaurant_name": "Italian",
        "pickup_lat": 34.0522,
        "pickup_lng": -118.2437,
        "marketing_demo": True,
    },
]


def _has_marketing_demo_rows(user_id: str) -> bool:
    try:
        with get_connection() as conn:
            row = conn.execute(
                "SELECT id FROM fulfillment_handoffs WHERE user_id=? AND status='pending' "
                "AND metadata_json LIKE ? LIMIT 1",
                (user_id, '%"marketing_demo": true%'),
            ).fetchone()
        return bool(row)
    except Exception as exc:
        logger.error("_has_marketing_demo_rows error: %s", exc)
        return False


def clear_marketing_demo_handoffs(user_id: str) -> int:
    """Remove pending marketing demo rows for a user. Returns rows deleted."""
    try:
        with get_connection() as conn:
            cur = conn.execute(
                "DELETE FROM fulfillment_handoffs WHERE user_id=? AND status='pending' "
                "AND metadata_json LIKE ?",
                (user_id, '%"marketing_demo": true%'),
            )
            conn.commit()
            deleted = cur.rowcount if cur.rowcount is not None else 0
        return deleted
    except Exception as exc:
        logger.error("clear_marketing_demo_handoffs error: %s", exc)
        return 0


def seed_marketing_handoffs(user_id: str, *, force: bool = False) -> list[dict]:
    """
    Insert sample handoffs for marketing screenshots.
    Idempotent unless force=True (replaces existing marketing demo rows).
    """
    if not FULFILLMENT_ENABLED:
        return []

    if _has_marketing_demo_rows(user_id) and not force:
        return [
            h for h in get_pending_handoffs(user_id)
            if (h.get("metadata") or {}).get("marketing_demo") is True
        ]

    if force:
        clear_marketing_demo_handoffs(user_id)

    created = create_handoffs(user_id, MARKETING_HANDOFF_SPECS)["handoffs"]
    logger.info("Seeded %d marketing demo handoffs for user=%s", len(created), user_id)
    return created
