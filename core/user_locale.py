"""Infer display units from a user's geography (home address + currency)."""
from __future__ import annotations

import logging
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

from db.location import get_user_places
from db.connection import get_connection

logger = logging.getLogger(__name__)

# ISO 3166-1 alpha-2 — countries that use Fahrenheit for everyday weather.
_FAHRENHEIT_COUNTRIES = frozenset({
    "US", "BS", "BZ", "KY", "PW", "FM", "MH",
    "GU", "PR", "VI", "AS", "MP",  # US territories
})

# Road-distance conventions (weather wind stays mph for UK even though °C).
_MILES_COUNTRIES = frozenset({"US", "GB", "LR", "MM"})

# open-meteo wind_speed_unit: mph for US/imperial and UK (Met Office-style forecasts).
_MPH_WIND_COUNTRIES = _FAHRENHEIT_COUNTRIES | frozenset({"GB"})

# When Home isn't geocoded, infer country from the currency they chose in Settings.
_CURRENCY_DEFAULT_COUNTRY: dict[str, str] = {
    "USD": "US",
    "GBP": "GB",
    "EUR": "DE",
    "CAD": "CA",
    "AUD": "AU",
    "NZD": "NZ",
    "JPY": "JP",
    "CNY": "CN",
    "INR": "IN",
    "BRL": "BR",
    "MXN": "MX",
    "SGD": "SG",
    "CHF": "CH",
    "KRW": "KR",
    "SEK": "SE",
    "NOK": "NO",
    "HKD": "HK",
    "ZAR": "ZA",
}

_CURRENCY_SYMBOLS: dict[str, str] = {
    "USD": "$",
    "EUR": "€",
    "GBP": "£",
    "CAD": "C$",
    "AUD": "A$",
    "NZD": "NZ$",
    "JPY": "¥",
    "CNY": "¥",
    "INR": "₹",
    "BRL": "R$",
    "MXN": "MX$",
    "SGD": "S$",
    "CHF": "CHF ",
    "KRW": "₩",
    "SEK": "kr",
    "NOK": "kr",
    "HKD": "HK$",
    "ZAR": "R",
}


@dataclass(frozen=True)
class UserLocale:
    currency: str
    country_code: str | None
    temperature_unit: str  # open-meteo: fahrenheit | celsius
    wind_speed_unit: str   # open-meteo: mph | kmh
    distance_unit: str     # miles | km
    temp_display: str      # °F | °C
    wind_display: str      # mph | km/h

    def format_money(self, amount: float | int, *, decimals: int = 0) -> str:
        sym = _CURRENCY_SYMBOLS.get(self.currency, f"{self.currency} ")
        if decimals:
            return f"{sym}{float(amount):,.{decimals}f}"
        return f"{sym}{float(amount):,.0f}"

    def prompt_block(self) -> str:
        country = self.country_code or "unknown"
        return (
            "LOCALE (use these units in chat unless the user explicitly asks otherwise):\n"
            f"  Country/region: {country}\n"
            f"  Money: {self.currency} ({self.format_money(0).replace('0', '…')} style)\n"
            f"  Temperature: {self.temp_display}\n"
            f"  Wind speed: {self.wind_display}\n"
            f"  Road distance: {self.distance_unit}\n"
            "When quoting their Orryon balances, spending, or bills, use their currency.\n"
            "When reporting weather from get_weather, use the units returned by the tool."
        )


def _http_json(url: str, timeout: int = 10) -> dict[str, Any]:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "orryon/1.0 (+https://orryon.com)"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        import json

        return json.loads(resp.read().decode())


def _geocode_country(address: str) -> str | None:
    q = urllib.parse.quote(address.strip())
    url = (
        "https://geocoding-api.open-meteo.com/v1/search?"
        f"name={q}&count=1&language=en&format=json"
    )
    try:
        data = _http_json(url)
        results = data.get("results") or []
        if not results:
            return None
        code = (results[0].get("country_code") or "").strip().upper()
        return code or None
    except Exception as exc:
        logger.debug("geocode country failed for %r: %s", address, exc)
        return None


def _home_address(user_id: str) -> str:
    for place in get_user_places(user_id):
        label = (place.get("label") or "").strip().lower()
        if label == "home":
            addr = (place.get("address") or "").strip()
            if addr:
                return addr
    return ""


def _user_currency(user_id: str) -> str:
    try:
        conn = get_connection()
        row = conn.execute("SELECT currency FROM users WHERE id=?", (user_id,)).fetchone()
        conn.close()
        if row and row["currency"]:
            return str(row["currency"]).upper()
    except Exception as exc:
        logger.debug("user currency lookup failed for %s: %s", user_id, exc)
    return "USD"


def _units_for_country(country_code: str | None) -> tuple[str, str, str, str, str]:
    cc = (country_code or "").upper()
    if cc in _FAHRENHEIT_COUNTRIES:
        temp_unit, temp_display = "fahrenheit", "°F"
    else:
        temp_unit, temp_display = "celsius", "°C"
    if cc in _MPH_WIND_COUNTRIES:
        wind_unit, wind_display = "mph", "mph"
    else:
        wind_unit, wind_display = "kmh", "km/h"
    distance = "miles" if cc in _MILES_COUNTRIES else "km"
    return temp_unit, temp_display, wind_unit, wind_display, distance


def get_user_language(user_id: str) -> str:
    """User's preferred UI language (ISO 639-1), from account settings."""
    try:
        conn = get_connection()
        row = conn.execute("SELECT language FROM users WHERE id=?", (user_id,)).fetchone()
        conn.close()
        if row and row["language"]:
            return str(row["language"]).strip().lower().split("-")[0] or "en"
    except Exception as exc:
        logger.debug("user language lookup failed for %s: %s", user_id, exc)
    return "en"


def get_user_locale(user_id: str) -> UserLocale:
    currency = _user_currency(user_id)
    home = _home_address(user_id)
    country_code = _geocode_country(home) if home else None
    if not country_code:
        country_code = _CURRENCY_DEFAULT_COUNTRY.get(currency)

    temp_unit, temp_display, wind_unit, wind_display, distance = _units_for_country(country_code)
    return UserLocale(
        currency=currency,
        country_code=country_code,
        temperature_unit=temp_unit,
        wind_speed_unit=wind_unit,
        distance_unit=distance,
        temp_display=temp_display,
        wind_display=wind_display,
    )
