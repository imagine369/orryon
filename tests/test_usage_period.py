"""Billing period extraction from Stripe subscription shapes."""

from core.usage_period import stripe_subscription_period_bounds


def test_period_bounds_from_subscription_items_basil():
    sub = {
        "items": {
            "data": [
                {
                    "current_period_start": 1747785600,  # 2025-05-21
                    "current_period_end": 1750464000,  # 2025-06-21
                }
            ]
        }
    }
    start, end = stripe_subscription_period_bounds(sub)
    assert start.startswith("2025-05-21")
    assert end.startswith("2025-06-21")


def test_period_bounds_legacy_subscription_root():
    sub = {
        "current_period_start": 1747785600,
        "current_period_end": 1750464000,
        "items": {"data": []},
    }
    start, end = stripe_subscription_period_bounds(sub)
    assert start.startswith("2025-05-21")
    assert end.startswith("2025-06-21")


def test_period_bounds_empty_when_missing():
    assert stripe_subscription_period_bounds({"items": {"data": [{}]}}) == ("", "")
