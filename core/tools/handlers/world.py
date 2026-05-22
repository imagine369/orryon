"""Live world context tools (weather via Open-Meteo — no API key)."""
from __future__ import annotations

import json
import logging
import urllib.parse
import urllib.request
from typing import Any

from db import get_user_places

logger = logging.getLogger(__name__)

# WMO weather interpretation codes (subset)
_WMO_LABELS: dict[int, str] = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Foggy",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Drizzle",
    55: "Heavy drizzle",
    61: "Light rain",
    63: "Rain",
    65: "Heavy rain",
    71: "Light snow",
    73: "Snow",
    75: "Heavy snow",
    80: "Rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    95: "Thunderstorm",
}


def _wmo_label(code: Any) -> str:
    try:
        return _WMO_LABELS.get(int(code), "Variable conditions")
    except (TypeError, ValueError):
        return "Variable conditions"


def _http_json(url: str, timeout: int = 12) -> dict:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "orryon/1.0 (+https://orryon.com)"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def _default_location(user_id: str) -> str:
    for place in get_user_places(user_id):
        label = (place.get("label") or "").strip().lower()
        if label in ("home", "work"):
            addr = (place.get("address") or "").strip()
            if addr:
                return addr
    return ""


def _geocode(location: str) -> dict | None:
    q = urllib.parse.quote(location.strip())
    url = (
        "https://geocoding-api.open-meteo.com/v1/search?"
        f"name={q}&count=1&language=en&format=json"
    )
    data = _http_json(url)
    results = data.get("results") or []
    if not results:
        return None
    row = results[0]
    return {
        "name": row.get("name") or location,
        "admin1": row.get("admin1") or "",
        "country": row.get("country") or "",
        "latitude": row["latitude"],
        "longitude": row["longitude"],
        "timezone": row.get("timezone") or "auto",
    }


def _get_weather(args: dict, user_id: str) -> dict:
    location = (args.get("location") or "").strip() or _default_location(user_id)
    if not location:
        return {
            "error": (
                "Need a city or place name (e.g. 'San Francisco' or 'London'). "
                "You can also save Home in Settings → Location with an address."
            ),
        }

    try:
        geo = _geocode(location)
        if not geo:
            return {"error": f"Could not find a place matching '{location}'."}

        lat = geo["latitude"]
        lon = geo["longitude"]
        forecast_url = (
            "https://api.open-meteo.com/v1/forecast?"
            f"latitude={lat}&longitude={lon}"
            "&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m"
            "&daily=weather_code,temperature_2m_max,temperature_2m_min"
            "&timezone=auto&forecast_days=2"
        )
        wx = _http_json(forecast_url)
        current = wx.get("current") or {}
        daily = wx.get("daily") or {}

        place_label = geo["name"]
        if geo.get("admin1"):
            place_label = f"{place_label}, {geo['admin1']}"
        if geo.get("country"):
            place_label = f"{place_label}, {geo['country']}"

        cur_temp = current.get("temperature_2m")
        cur_code = current.get("weather_code")
        humidity = current.get("relative_humidity_2m")
        wind = current.get("wind_speed_10m")

        hi = (daily.get("temperature_2m_max") or [None])[0]
        lo = (daily.get("temperature_2m_min") or [None])[0]
        today_code = (daily.get("weather_code") or [cur_code])[0]

        units = wx.get("current_units") or {}
        temp_unit = units.get("temperature_2m") or "°C"
        wind_unit = units.get("wind_speed_10m") or "km/h"

        return {
            "location": place_label,
            "query": location,
            "current": {
                "temperature": cur_temp,
                "temperature_unit": temp_unit,
                "conditions": _wmo_label(cur_code),
                "humidity_percent": humidity,
                "wind_speed": wind,
                "wind_unit": wind_unit,
            },
            "today": {
                "high": hi,
                "low": lo,
                "conditions": _wmo_label(today_code),
            },
            "source": "Open-Meteo (live)",
            "fetched_at": current.get("time") or wx.get("timezone_abbreviation"),
        }
    except Exception as exc:
        logger.warning("get_weather failed for %r user=%s: %s", location, user_id, exc)
        return {"error": f"Weather lookup failed: {exc}"}
