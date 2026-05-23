"""Live world context tools (weather via Open-Meteo, news via Google News RSS)."""
from __future__ import annotations

import json
import logging
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from html import unescape
from typing import Any

from db import get_user_places
from core.user_locale import get_user_locale

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


def _http_get(url: str, timeout: int = 12) -> bytes:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "orryon/1.0 (+https://orryon.com)"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def _http_json(url: str, timeout: int = 12) -> dict:
    return json.loads(_http_get(url, timeout=timeout).decode())


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
        "country_code": (row.get("country_code") or "").upper(),
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
        locale = get_user_locale(user_id)
        forecast_url = (
            "https://api.open-meteo.com/v1/forecast?"
            f"latitude={lat}&longitude={lon}"
            "&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m"
            "&daily=weather_code,temperature_2m_max,temperature_2m_min"
            f"&temperature_unit={locale.temperature_unit}"
            f"&wind_speed_unit={locale.wind_speed_unit}"
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
            "user_locale": {
                "country_code": locale.country_code,
                "currency": locale.currency,
                "temperature_preference": locale.temp_display,
                "wind_preference": locale.wind_display,
            },
            "source": "Open-Meteo (live)",
            "fetched_at": current.get("time") or wx.get("timezone_abbreviation"),
        }
    except Exception as exc:
        logger.warning("get_weather failed for %r user=%s: %s", location, user_id, exc)
        return {"error": f"Weather lookup failed: {exc}"}


_GOOGLE_NEWS_LOCALE = {
    "US": ("en-US", "US", "US:en"),
    "GB": ("en-GB", "GB", "GB:en"),
    "CA": ("en-CA", "CA", "CA:en"),
    "AU": ("en-AU", "AU", "AU:en"),
}


def _news_rss_url(query: str, country_code: str) -> str:
    hl, gl, ceid = _GOOGLE_NEWS_LOCALE.get(country_code.upper(), ("en-US", "US", "US:en"))
    if query:
        q = urllib.parse.quote(query.strip())
        return f"https://news.google.com/rss/search?q={q}&hl={hl}&gl={gl}&ceid={ceid}"
    return f"https://news.google.com/rss?hl={hl}&gl={gl}&ceid={ceid}"


def _strip_html(text: str) -> str:
    return unescape(re.sub(r"<[^>]+>", "", text or "")).strip()


def _parse_news_rss(xml_text: str, limit: int = 8) -> list[dict]:
    root = ET.fromstring(xml_text)
    items: list[dict] = []
    for item in root.findall(".//item")[:limit]:
        title = _strip_html(item.findtext("title") or "")
        link = (item.findtext("link") or "").strip()
        published = (item.findtext("pubDate") or "").strip()
        source_el = item.find("source")
        source = (source_el.text or "").strip() if source_el is not None else ""
        if title:
            items.append({
                "title": title,
                "source": source,
                "link": link,
                "published": published,
            })
    return items


def _search_web(args: dict, user_id: str) -> dict:
    """Fetch recent headlines from Google News public RSS (no API key)."""
    query = (args.get("query") or "").strip()
    locale = get_user_locale(user_id)
    cc = (locale.country_code or "US").upper()
    limit = min(max(int(args.get("limit") or 8), 1), 12)

    try:
        url = _news_rss_url(query, cc)
        headlines = _parse_news_rss(_http_get(url).decode("utf-8", errors="replace"), limit=limit)
        if not headlines:
            return {"error": "No headlines found for that search."}

        return {
            "query": query or None,
            "region": cc,
            "headlines": headlines,
            "count": len(headlines),
            "source": "Google News (public RSS)",
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as exc:
        logger.warning("search_web failed query=%r user=%s: %s", query, user_id, exc)
        return {"error": f"News lookup failed: {exc}"}
