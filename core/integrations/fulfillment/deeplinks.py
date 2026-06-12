"""
Build partner deeplinks locally — no HTTP calls to Uber, DoorDash, Instacart, etc.

Privacy: URLs are constructed on-server from user place coordinates or addresses.
Orryon never completes checkout on the user's behalf; the partner app handles payment.
"""
from __future__ import annotations

import urllib.parse
from typing import Any


def _append_params(url: str, params: dict[str, str]) -> str:
    """Append query params to a URL, preserving any existing params. New values override."""
    if not params:
        return url
    parsed = urllib.parse.urlparse(url)
    existing = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)
    merged = {k: v[0] for k, v in existing.items()}
    merged.update(params)
    return urllib.parse.urlunparse(parsed._replace(query=urllib.parse.urlencode(merged)))


def _has_lat_lng(lat: Any, lng: Any) -> bool:
    """True when both coordinates are present (0.0 is valid — Gulf of Guinea / prime meridian)."""
    return lat is not None and lng is not None


def build_uber_ride_link(
    *,
    pickup_lat: float,
    pickup_lng: float,
    dropoff_lat: float,
    dropoff_lng: float,
    client_id: str = "",
    pickup_nickname: str = "",
    dropoff_nickname: str = "",
) -> str:
    """Universal Uber ride deeplink (opens native app when installed)."""
    params: dict[str, str] = {
        "action": "setPickup",
        "pickup[latitude]": str(pickup_lat),
        "pickup[longitude]": str(pickup_lng),
        "dropoff[latitude]": str(dropoff_lat),
        "dropoff[longitude]": str(dropoff_lng),
    }
    if client_id:
        params["client_id"] = client_id
    if pickup_nickname:
        params["pickup[nickname]"] = pickup_nickname
    if dropoff_nickname:
        params["dropoff[nickname]"] = dropoff_nickname
    return "https://m.uber.com/ul/?" + urllib.parse.urlencode(params)


def _doordash_store_url(partner_url: str) -> bool:
    """True when partner_url is a store-specific DoorDash link, not the site homepage."""
    if not partner_url.startswith("http"):
        return False
    normalized = partner_url.rstrip("/").lower()
    if normalized in ("https://www.doordash.com", "http://www.doordash.com"):
        return False
    return "/store/" in normalized or "/merchant/" in normalized


def build_doordash_link(*, partner_url: str = "", restaurant_name: str = "") -> str:
    """DoorDash store URL or search fallback."""
    if partner_url and _doordash_store_url(partner_url):
        return partner_url
    if restaurant_name:
        q = urllib.parse.quote_plus(restaurant_name.strip())
        return f"https://www.doordash.com/search/store/{q}"
    if partner_url and partner_url.startswith("http"):
        return partner_url
    return "https://www.doordash.com/"


def build_instacart_grocery_link(
    *,
    items: list[str] | None = None,
    near_address: str = "",
) -> str:
    """Instacart search deeplink with optional item query (no IDP API)."""
    if items:
        q = urllib.parse.quote_plus(" ".join(i.strip() for i in items if i.strip())[:200])
        return f"https://www.instacart.com/store/s?k={q}"
    if near_address:
        q = urllib.parse.quote_plus(near_address.strip()[:120])
        return f"https://www.instacart.com/store/s?k={q}"
    return "https://www.instacart.com/store/"


def _opentable_restaurant_url(partner_url: str) -> bool:
    """True when partner_url is a restaurant page, not the OpenTable homepage."""
    if not partner_url.startswith("http"):
        return False
    normalized = partner_url.rstrip("/").lower()
    if normalized in (
        "https://www.opentable.com",
        "http://www.opentable.com",
        "https://opentable.com",
        "http://opentable.com",
    ):
        return False
    return "/r/" in normalized or "/restaurant/" in normalized


def build_opentable_link(
    *,
    partner_url: str = "",
    query: str = "",
    lat: float | None = None,
    lng: float | None = None,
    date: str = "",
    time: str = "",
    covers: int | None = None,
) -> str:
    """OpenTable restaurant page or nearby search, with optional pre-filled booking params."""
    booking_params: dict[str, str] = {}
    if date:
        booking_params["date"] = date
    if time:
        booking_params["time"] = time
    if covers is not None:
        booking_params["covers"] = str(covers)

    if partner_url and _opentable_restaurant_url(partner_url):
        return _append_params(partner_url, booking_params)
    params: dict[str, str] = {}
    if query:
        params["term"] = query.strip()
    if _has_lat_lng(lat, lng):
        params["latitude"] = str(lat)
        params["longitude"] = str(lng)
    if params:
        return "https://www.opentable.com/s?" + urllib.parse.urlencode(params)
    if partner_url and partner_url.startswith("http"):
        return partner_url
    return "https://www.opentable.com/"


def _resy_venue_url(partner_url: str) -> bool:
    """True when partner_url is a Resy venue page, not the homepage."""
    if not partner_url.startswith("http"):
        return False
    normalized = partner_url.rstrip("/").lower()
    if normalized in (
        "https://resy.com",
        "http://resy.com",
        "https://www.resy.com",
        "http://www.resy.com",
    ):
        return False
    return "/venues/" in normalized


def build_resy_link(
    *,
    partner_url: str = "",
    date: str = "",
    seats: int | None = None,
) -> str:
    """Resy venue page with optional pre-filled date and party size."""
    booking_params: dict[str, str] = {}
    if date:
        booking_params["date"] = date
    if seats is not None:
        booking_params["seats"] = str(seats)

    if partner_url and _resy_venue_url(partner_url):
        return _append_params(partner_url, booking_params)
    if partner_url and partner_url.startswith("http"):
        return partner_url
    return "https://resy.com/"


def _yelp_biz_url(partner_url: str) -> bool:
    """True when partner_url is a Yelp business page, not the homepage."""
    if not partner_url.startswith("http"):
        return False
    normalized = partner_url.rstrip("/").lower()
    if normalized in (
        "https://www.yelp.com",
        "http://www.yelp.com",
        "https://yelp.com",
        "http://yelp.com",
    ):
        return False
    return "/biz/" in normalized


def build_yelp_link(
    *,
    partner_url: str = "",
    query: str = "",
    date: str = "",
    time: str = "",
    covers: int | None = None,
) -> str:
    """Yelp business page with optional reservation pre-fill, or name-search fallback."""
    booking_params: dict[str, str] = {}
    if date:
        booking_params["reservation_date"] = date
    if time:
        booking_params["reservation_time"] = time
    if covers is not None:
        booking_params["reservation_covers"] = str(covers)

    if partner_url and _yelp_biz_url(partner_url):
        return _append_params(partner_url, booking_params)
    if query:
        q = urllib.parse.quote_plus(query.strip())
        return f"https://www.yelp.com/search?find_desc={q}"
    if partner_url and partner_url.startswith("http"):
        return partner_url
    return "https://www.yelp.com/"


def _tock_venue_url(partner_url: str) -> bool:
    """True when partner_url is a specific Tock venue page (not the homepage)."""
    if not partner_url.startswith("http"):
        return False
    normalized = partner_url.rstrip("/").lower()
    if normalized in (
        "https://www.exploretock.com",
        "http://www.exploretock.com",
        "https://exploretock.com",
        "http://exploretock.com",
    ):
        return False
    parsed = urllib.parse.urlparse(normalized)
    return bool(parsed.path.strip("/"))


def build_tock_link(
    *,
    partner_url: str = "",
    date: str = "",
    time: str = "",
    size: int | None = None,
) -> str:
    """Tock venue page with optional pre-filled date, time, and party size."""
    booking_params: dict[str, str] = {}
    if date:
        booking_params["date"] = date
    if time:
        booking_params["time"] = time
    if size is not None:
        booking_params["size"] = str(size)

    if partner_url and _tock_venue_url(partner_url):
        return _append_params(partner_url, booking_params)
    if partner_url and partner_url.startswith("http"):
        return partner_url
    return "https://www.exploretock.com/"


def build_pharmacy_link(
    *,
    brand: str = "cvs",
    near_address: str = "",
    lat: float | None = None,
    lng: float | None = None,
) -> str:
    """Maps search for nearest pharmacy (zero API cost)."""
    brand_label = "CVS Pharmacy" if brand.lower() == "cvs" else "Walgreens"
    if _has_lat_lng(lat, lng):
        q = urllib.parse.quote_plus(f"{brand_label} near {lat},{lng}")
    elif near_address:
        q = urllib.parse.quote_plus(f"{brand_label} near {near_address}")
    else:
        q = urllib.parse.quote_plus(brand_label)
    return f"https://www.google.com/maps/search/?api=1&query={q}"


_RESERVATION_PLATFORM_LABELS: dict[str, str] = {
    "opentable": "Book on OpenTable",
    "resy": "Book on Resy",
    "yelp": "Book on Yelp",
    "tock": "Book on Tock",
    "direct": "Make a Reservation",
}


def action_label_for_type(handoff_type: str, *, platform: str = "") -> str:
    if handoff_type == "reservation":
        return _RESERVATION_PLATFORM_LABELS.get(platform.lower(), "Book on OpenTable")
    labels = {
        "ride": "Open Uber",
        "delivery": "Order on DoorDash",
        "grocery": "Shop on Instacart",
        "pharmacy": "Find pharmacy",
    }
    return labels.get(handoff_type, "Open")


def build_action_url(handoff_type: str, payload: dict[str, Any], *, uber_client_id: str = "") -> str:
    """Resolve a handoff type + payload into a partner deeplink."""
    if handoff_type == "ride":
        pickup = payload.get("pickup") or {}
        dropoff = payload.get("dropoff") or {}
        plat, plng = pickup.get("lat"), pickup.get("lng")
        dlat, dlng = dropoff.get("lat"), dropoff.get("lng")
        if _has_lat_lng(plat, plng) and _has_lat_lng(dlat, dlng):
            return build_uber_ride_link(
                pickup_lat=float(plat),
                pickup_lng=float(plng),
                dropoff_lat=float(dlat),
                dropoff_lng=float(dlng),
                client_id=uber_client_id,
                pickup_nickname=str(pickup.get("label") or ""),
                dropoff_nickname=str(dropoff.get("label") or ""),
            )
        if uber_client_id:
            return f"https://m.uber.com/ul/?client_id={urllib.parse.quote(uber_client_id)}"
        return "https://m.uber.com/ul/"
    if handoff_type == "delivery":
        return build_doordash_link(
            partner_url=str(payload.get("partner_url") or ""),
            restaurant_name=str(payload.get("restaurant_name") or payload.get("title") or ""),
        )
    if handoff_type == "grocery":
        return build_instacart_grocery_link(
            items=payload.get("grocery_items") or payload.get("items"),
            near_address=str(payload.get("near_address") or ""),
        )
    if handoff_type == "reservation":
        lat = payload.get("lat")
        lng = payload.get("lng")
        platform = str(payload.get("reservation_platform") or "").lower()
        date = str(payload.get("reservation_date") or "")
        time_ = str(payload.get("reservation_time") or "")
        party_size = payload.get("party_size")
        covers = int(party_size) if party_size is not None else None
        partner_url = str(payload.get("partner_url") or "")

        if platform == "resy":
            return build_resy_link(
                partner_url=partner_url,
                date=date,
                seats=covers,
            )
        if platform == "yelp":
            return build_yelp_link(
                partner_url=partner_url,
                query=str(payload.get("restaurant_name") or payload.get("title") or ""),
                date=date,
                time=time_,
                covers=covers,
            )
        if platform == "tock":
            return build_tock_link(
                partner_url=partner_url,
                date=date,
                time=time_,
                size=covers,
            )
        if platform == "direct":
            if partner_url and partner_url.startswith("http"):
                return partner_url
            restaurant_name = str(payload.get("restaurant_name") or payload.get("title") or "")
            if restaurant_name:
                q = urllib.parse.quote_plus(f"{restaurant_name.strip()} reservations")
                return f"https://www.google.com/search?q={q}"
            return "https://www.google.com/search?q=restaurant+reservations"
        return build_opentable_link(
            partner_url=partner_url,
            query=str(payload.get("restaurant_name") or payload.get("title") or ""),
            lat=float(lat) if lat is not None else None,
            lng=float(lng) if lng is not None else None,
            date=date,
            time=time_,
            covers=covers,
        )
    if handoff_type == "pharmacy":
        lat = payload.get("lat")
        lng = payload.get("lng")
        return build_pharmacy_link(
            brand=str(payload.get("pharmacy_brand") or "cvs"),
            near_address=str(payload.get("near_address") or ""),
            lat=float(lat) if lat is not None else None,
            lng=float(lng) if lng is not None else None,
        )
    partner = str(payload.get("partner_url") or "")
    if partner.startswith("http"):
        return partner
    raise ValueError(f"Unknown fulfillment type: {handoff_type}")
