"""Unit tests for fulfillment deeplinks (no DB, no FastAPI import)."""
from __future__ import annotations

from core.integrations.fulfillment.deeplinks import (
    action_label_for_type,
    build_action_url,
    build_doordash_link,
    build_instacart_grocery_link,
    build_opentable_link,
    build_pharmacy_link,
    build_resy_link,
    build_tock_link,
    build_uber_ride_link,
    build_yelp_link,
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


# ── OpenTable booking params ──────────────────────────────────────────────────

def test_opentable_booking_params_appended_to_venue_url():
    url = build_opentable_link(
        partner_url="https://www.opentable.com/r/le-bernardin-new-york",
        date="2026-06-20",
        time="19:30",
        covers=2,
    )
    assert "date=2026-06-20" in url
    assert "time=19%3A30" in url or "time=19:30" in url
    assert "covers=2" in url


def test_opentable_booking_params_not_added_to_search():
    url = build_opentable_link(query="Italian", lat=37.77, lng=-122.41, date="2026-06-20")
    assert "/s?" in url
    assert "date=" not in url


# ── Resy ──────────────────────────────────────────────────────────────────────

def test_resy_venue_passthrough_with_params():
    url = build_resy_link(
        partner_url="https://resy.com/cities/ny/venues/le-bernardin",
        date="2026-06-20",
        seats=2,
    )
    assert "resy.com" in url
    assert "date=2026-06-20" in url
    assert "seats=2" in url


def test_resy_homepage_fallback():
    url = build_resy_link()
    assert url == "https://resy.com/"


def test_resy_non_venue_partner_url_passthrough():
    raw = "https://resy.com/cities/ny/venues/le-bernardin"
    url = build_resy_link(partner_url=raw)
    assert "resy.com" in url


def test_resy_homepage_partner_url_falls_back():
    url = build_resy_link(partner_url="https://resy.com/", date="2026-06-20", seats=4)
    assert url == "https://resy.com/"


# ── Yelp ──────────────────────────────────────────────────────────────────────

def test_yelp_biz_passthrough_with_booking_params():
    url = build_yelp_link(
        partner_url="https://www.yelp.com/biz/nobu-malibu",
        date="2026-06-21",
        time="20:00",
        covers=4,
    )
    assert "yelp.com/biz/" in url
    assert "reservation_date=2026-06-21" in url
    assert "reservation_time=20%3A00" in url or "reservation_time=20:00" in url
    assert "reservation_covers=4" in url


def test_yelp_search_fallback_with_query():
    url = build_yelp_link(query="Sushi")
    assert "yelp.com/search" in url
    assert "Sushi" in url


def test_yelp_homepage_fallback():
    url = build_yelp_link()
    assert url == "https://www.yelp.com/"


def test_yelp_homepage_partner_url_falls_back():
    url = build_yelp_link(partner_url="https://www.yelp.com", date="2026-06-20")
    assert "yelp.com/search" not in url
    assert "reservation_date" not in url
    assert url.rstrip("/") == "https://www.yelp.com"


# ── Tock ──────────────────────────────────────────────────────────────────────

def test_tock_venue_passthrough_with_params():
    url = build_tock_link(
        partner_url="https://www.exploretock.com/alinea",
        date="2026-07-04",
        time="18:00",
        size=2,
    )
    assert "exploretock.com/alinea" in url
    assert "date=2026-07-04" in url
    assert "time=18%3A00" in url or "time=18:00" in url
    assert "size=2" in url


def test_tock_homepage_fallback():
    url = build_tock_link()
    assert url == "https://www.exploretock.com/"


def test_tock_homepage_partner_url_falls_back():
    url = build_tock_link(partner_url="https://www.exploretock.com", date="2026-07-04")
    assert "date=" not in url
    assert url.rstrip("/") == "https://www.exploretock.com"


# ── build_action_url platform routing ────────────────────────────────────────

def test_build_action_url_reservation_resy():
    url = build_action_url("reservation", {
        "reservation_platform": "resy",
        "partner_url": "https://resy.com/cities/ny/venues/le-bernardin",
        "reservation_date": "2026-06-20",
        "party_size": 2,
    })
    assert "resy.com" in url
    assert "date=2026-06-20" in url
    assert "seats=2" in url


def test_build_action_url_reservation_yelp():
    url = build_action_url("reservation", {
        "reservation_platform": "yelp",
        "partner_url": "https://www.yelp.com/biz/nobu-malibu",
        "restaurant_name": "Nobu Malibu",
        "reservation_date": "2026-06-21",
        "reservation_time": "19:00",
        "party_size": 3,
    })
    assert "yelp.com/biz/" in url
    assert "reservation_date=2026-06-21" in url
    assert "reservation_covers=3" in url


def test_build_action_url_reservation_tock():
    url = build_action_url("reservation", {
        "reservation_platform": "tock",
        "partner_url": "https://www.exploretock.com/alinea",
        "reservation_date": "2026-07-04",
        "reservation_time": "18:00",
        "party_size": 2,
    })
    assert "exploretock.com/alinea" in url
    assert "date=2026-07-04" in url
    assert "size=2" in url


def test_build_action_url_reservation_defaults_to_opentable():
    url = build_action_url("reservation", {
        "restaurant_name": "Italian Place",
        "lat": 37.77,
        "lng": -122.41,
    })
    assert "opentable.com" in url


# ── action_label_for_type platform-aware ──────────────────────────────────────

def test_action_label_reservation_default():
    assert action_label_for_type("reservation") == "Book on OpenTable"


def test_action_label_reservation_opentable_explicit():
    assert action_label_for_type("reservation", platform="opentable") == "Book on OpenTable"


def test_action_label_reservation_resy():
    assert action_label_for_type("reservation", platform="resy") == "Book on Resy"


def test_action_label_reservation_yelp():
    assert action_label_for_type("reservation", platform="yelp") == "Book on Yelp"


def test_action_label_reservation_tock():
    assert action_label_for_type("reservation", platform="tock") == "Book on Tock"


def test_action_label_reservation_unknown_platform_falls_back():
    assert action_label_for_type("reservation", platform="unknown") == "Book on OpenTable"


def test_action_label_non_reservation_unaffected():
    assert action_label_for_type("ride") == "Open Uber"
    assert action_label_for_type("delivery") == "Order on DoorDash"
