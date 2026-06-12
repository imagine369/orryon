"""OpenAI-compatible tool schemas — instant fulfillment (deeplink handoffs)."""
from __future__ import annotations

SCHEMAS: list[dict] = [{
    "type": "function",
    "function": {
        "name": "create_fulfillment_handoff",
        "description": (
            "Create errand handoffs for Quick Access → Errands (Uber, DoorDash, Instacart "
            "checkout, restaurant reservations on OpenTable/Resy/Yelp/Tock, pharmacy). NOT "
            "for adding items to the shopping list — use add_grocery_items instead (Quick "
            "Access → Lists → Grocery). Use when the user wants to order or book in an "
            "external app. For grocery type, Instacart pulls from their Grocery list unless "
            "grocery_items is passed. For reservations: pass reservation_platform, partner_url "
            "(the exact venue page found via web_search), reservation_date, reservation_time, "
            "and party_size to generate a pre-filled booking link."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "handoffs": {
                    "type": "array",
                    "description": "One or more handoffs to create in a single call.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "type": {
                                "type": "string",
                                "enum": ["ride", "delivery", "grocery", "reservation", "pharmacy"],
                                "description": "Errand category.",
                            },
                            "title": {
                                "type": "string",
                                "description": "Short card title (restaurant name, errand label).",
                            },
                            "subtitle": {
                                "type": "string",
                                "description": "Optional detail line (address, items, route).",
                            },
                            "pickup_place": {
                                "type": "string",
                                "description": "Saved place label for pickup (Home, Work, Gym).",
                            },
                            "destination_place": {
                                "type": "string",
                                "description": "Saved place label for destination.",
                            },
                            "destination_address": {
                                "type": "string",
                                "description": "Free-text address when not a saved place.",
                            },
                            "partner_url": {
                                "type": "string",
                                "description": (
                                    "Direct venue/store URL found via web_search "
                                    "(DoorDash, OpenTable, Resy, Yelp, or Tock page)."
                                ),
                            },
                            "reservation_platform": {
                                "type": "string",
                                "enum": ["opentable", "resy", "yelp", "tock", "direct"],
                                "description": (
                                    "Booking platform confirmed via web_search. REQUIRED for "
                                    "reservation type — never omit or assume. Use 'direct' when "
                                    "the restaurant uses its own website, SevenRooms, Rezdiary, "
                                    "or any platform not in the other four options; pass the "
                                    "booking URL as partner_url."
                                ),
                            },
                            "reservation_date": {
                                "type": "string",
                                "description": "Desired reservation date in YYYY-MM-DD format.",
                            },
                            "reservation_time": {
                                "type": "string",
                                "description": "Desired reservation time in HH:MM (24-hour) format.",
                            },
                            "party_size": {
                                "type": "integer",
                                "description": "Number of guests for the reservation.",
                            },
                            "restaurant_name": {
                                "type": "string",
                                "description": "Restaurant name for delivery or reservation search.",
                            },
                            "grocery_items": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "Grocery item names; omit to use user's list.",
                            },
                            "pharmacy_brand": {
                                "type": "string",
                                "enum": ["cvs", "walgreens"],
                                "description": "Preferred pharmacy brand for pickup.",
                            },
                            "medication_name": {
                                "type": "string",
                                "description": "Medication name for pharmacy pickup context.",
                            },
                            "notes": {
                                "type": "string",
                                "description": "Optional context for the user.",
                            },
                        },
                        "required": ["type", "title"],
                    },
                },
            },
            "required": ["handoffs"],
        },
    },
}]
