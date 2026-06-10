"""OpenAI-compatible tool schemas — instant fulfillment (deeplink handoffs)."""
from __future__ import annotations

SCHEMAS: list[dict] = [{
    "type": "function",
    "function": {
        "name": "create_fulfillment_handoff",
        "description": (
            "Create errand handoffs for Quick Access → Errands (Uber, DoorDash, Instacart "
            "checkout, OpenTable, pharmacy). NOT for adding items to the shopping list — use "
            "add_grocery_items instead (Quick Access → Lists → Grocery). Use when the user "
            "wants to order or book in an external app. For grocery type, Instacart pulls "
            "from their Grocery list unless grocery_items is passed. Pass partner_url when "
            "web_search found a specific DoorDash or OpenTable page."
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
                                "description": "Direct DoorDash/OpenTable URL from web_search.",
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
