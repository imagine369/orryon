"""Unit tests for geography-based locale inference."""
from core.user_locale import UserLocale, _units_for_country, get_user_locale


def test_us_uses_fahrenheit_and_miles():
    temp_u, temp_d, wind_u, wind_d, dist = _units_for_country("US")
    assert temp_u == "fahrenheit"
    assert temp_d == "°F"
    assert wind_u == "mph"
    assert dist == "miles"


def test_uk_uses_celsius_mph_miles():
    temp_u, temp_d, wind_u, wind_d, dist = _units_for_country("GB")
    assert temp_u == "celsius"
    assert temp_d == "°C"
    assert wind_u == "mph"
    assert dist == "miles"


def test_germany_uses_metric():
    temp_u, temp_d, wind_u, wind_d, dist = _units_for_country("DE")
    assert temp_u == "celsius"
    assert wind_u == "kmh"
    assert dist == "km"


def test_format_money_usd():
    loc = UserLocale(
        currency="USD",
        country_code="US",
        temperature_unit="fahrenheit",
        wind_speed_unit="mph",
        distance_unit="miles",
        temp_display="°F",
        wind_display="mph",
    )
    assert loc.format_money(1234) == "$1,234"


def test_format_money_eur():
    loc = UserLocale(
        currency="EUR",
        country_code="DE",
        temperature_unit="celsius",
        wind_speed_unit="kmh",
        distance_unit="km",
        temp_display="°C",
        wind_display="km/h",
    )
    assert loc.format_money(1234) == "€1,234"


def test_get_user_locale_defaults_to_usd_metric_fallback(monkeypatch):
    monkeypatch.setattr("core.user_locale._user_currency", lambda _uid: "USD")
    monkeypatch.setattr("core.user_locale._home_address", lambda _uid: "")
    loc = get_user_locale("test-user")
    assert loc.currency == "USD"
    assert loc.temperature_unit == "fahrenheit"
    assert loc.wind_speed_unit == "mph"
