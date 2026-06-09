"""Tests for fulfillment handoff place resolution."""
from __future__ import annotations

from core.integrations.fulfillment.handoff import create_handoffs, resolve_user_place
from core.tools import execute_tool
from db.auth import get_or_create_user_by_email
from db.location import add_user_place


def test_resolve_user_place_exact_match_only():
    user = get_or_create_user_by_email("pytest-fulfillment-places@orryon.app")
    uid = user["id"]

    add_user_place(uid, "Network Workshop", address="123 Workshop St", lat=1.0, lng=2.0)
    add_user_place(uid, "Work", address="456 Office Blvd", lat=3.0, lng=4.0)

    office = resolve_user_place(uid, "work")
    assert office["label"] == "Work"
    assert office["address"] == "456 Office Blvd"
    assert office["lat"] == 3.0

    # "work" is a substring of "network workshop" — must not false-match that place
    workshop = resolve_user_place(uid, "workshop")
    assert workshop["label"] == "workshop"
    assert workshop["address"] == "workshop"
    assert workshop["lat"] is None

    partial = resolve_user_place(uid, "shop")
    assert partial["label"] == "shop"
    assert partial["address"] == "shop"
    assert partial["lat"] is None
    assert partial["lng"] is None


def test_resolve_user_place_unset_db_coords_are_none():
    user = get_or_create_user_by_email("pytest-fulfillment-places-nogeo@orryon.app")
    uid = user["id"]
    add_user_place(uid, "Home", address="94105 Market St", lat=0, lng=0)

    home = resolve_user_place(uid, "Home")
    assert home["address"] == "94105 Market St"
    assert home["lat"] is None
    assert home["lng"] is None


def test_pharmacy_handoff_uses_address_when_place_not_geocoded():
    user = get_or_create_user_by_email("pytest-fulfillment-pharmacy-addr@orryon.app")
    uid = user["id"]
    add_user_place(uid, "Home", address="94105 Market St", lat=0, lng=0)

    result, _ = execute_tool(
        "create_fulfillment_handoff",
        {
            "handoffs": [
                {
                    "type": "pharmacy",
                    "title": "CVS pickup",
                    "destination_place": "Home",
                },
            ],
        },
        uid,
    )
    assert result["status"] == "ok"
    url = result["handoffs"][0]["action_url"]
    assert "94105" in url or "Market" in url
    assert "0%2C0" not in url


def test_delivery_cache_distinguishes_restaurant_names():
    user = get_or_create_user_by_email("pytest-fulfillment-cache-names@orryon.app")
    uid = user["id"]
    shared_url = "https://www.doordash.com/"
    batch_a = create_handoffs(
        uid,
        [
            {
                "type": "delivery",
                "title": "Thai Basil",
                "restaurant_name": "Thai Basil",
                "partner_url": shared_url,
            },
        ],
    )
    batch_b = create_handoffs(
        uid,
        [
            {
                "type": "delivery",
                "title": "Pizza Hut",
                "restaurant_name": "Pizza Hut",
                "partner_url": shared_url,
            },
        ],
    )
    url_a = batch_a["handoffs"][0]["action_url"]
    url_b = batch_b["handoffs"][0]["action_url"]
    assert url_a != url_b
    assert "Thai" in url_a or "Basil" in url_a
    assert "Pizza" in url_b
