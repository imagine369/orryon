"""Unit tests for fulfillment deeplinks (no DB, no FastAPI import)."""
from __future__ import annotations

from core.integrations.fulfillment.deeplinks import (
    build_doordash_link,
    build_instacart_grocery_link,
    build_opentable_link,
    build_pharmacy_link,
    build_uber_ride_link,
    build_action_url,
)


def test_uber_ride_link_includes_coords_and_client():
    url = build_uber_ride_link(
        pickup_lat=37.77,
        pickup_lng=-122.41,
        dropoff_lat=37.79,
        dropoff_lng=-122.40,
        client_id="test-client",
        pickup_nickname="Home",
        dropoff_nickname="Work",
    )
    assert url.startswith("https://m.uber.com/ul/?")
    assert "client_id=test-client" in url
    assert "pickup" in url
    assert "dropoff" in url


def test_doordash_partner_url_passthrough():
    url = build_doordash_link(partner_url="https://www.doordash.com/store/example-123")
    assert url == "https://www.doordash.com/store/example-123"


def test_instacart_grocery_items_query():
    url = build_instacart_grocery_link(items=["milk", "eggs"])
    assert "instacart.com" in url
    assert "milk" in url


def test_opentable_search():
    url = build_opentable_link(query="Italian", lat=37.77, lng=-122.41)
    assert "opentable.com" in url
    assert "Italian" in url or "italian" in url.lower()


def test_pharmacy_maps_link():
    url = build_pharmacy_link(brand="cvs", near_address="94105")
    assert "google.com/maps" in url


def test_build_action_url_ride_with_zero_coords():
    url = build_action_url(
        "ride",
        {"pickup": {"lat": 0, "lng": 0}, "dropoff": {"lat": 0, "lng": 0}},
    )
    assert "m.uber.com" in url
    assert "pickup" in url
    assert "dropoff" in url


def test_build_action_url_ride_fallback_without_coords():
    url = build_action_url(
        "ride",
        {"pickup": {}, "dropoff": {}},
        uber_client_id="cid",
    )
    assert "m.uber.com" in url
    assert "client_id=cid" in url


def test_opentable_includes_zero_coords():
    url = build_opentable_link(query="Seafood", lat=0.0, lng=0.0)
    assert "latitude=0.0" in url or "latitude=0" in url
    assert "longitude=0.0" in url or "longitude=0" in url


def test_pharmacy_includes_zero_coords():
    url = build_pharmacy_link(brand="cvs", lat=0.0, lng=0.0)
    assert "0%2C0" in url or "0,0" in url


def test_doordash_homepage_with_restaurant_name_uses_search():
    url = build_doordash_link(
        partner_url="https://www.doordash.com/",
        restaurant_name="Thai Basil",
    )
    assert "/search/store/" in url
    assert "Thai" in url


def test_opentable_homepage_with_query_uses_search():
    url = build_opentable_link(
        partner_url="https://www.opentable.com/",
        query="Italian",
        lat=37.77,
        lng=-122.41,
    )
    assert "/s?" in url
    assert "Italian" in url or "italian" in url.lower()


def test_opentable_partner_restaurant_passthrough():
    url = build_opentable_link(
        partner_url="https://www.opentable.com/r/the-french-laundry-yountville",
    )
    assert url == "https://www.opentable.com/r/the-french-laundry-yountville"


def test_build_action_url_delivery():
    url = build_action_url("delivery", {"restaurant_name": "Thai Basil"})
    assert "doordash.com" in url
