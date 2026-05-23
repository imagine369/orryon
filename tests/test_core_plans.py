"""Plan caps and resolution — guard against accidental quota changes."""

from core.plans import (
    MONTHLY_SPEND_CAP_USD_BY_PLAN,
    get_monthly_spend_cap,
    get_monthly_token_cap,
    resolve_plan,
)


def test_pro_spend_cap():
    assert get_monthly_spend_cap("pro") == 5.94


def test_trial_spend_cap():
    assert get_monthly_spend_cap("trial") == 2.0


def test_token_cap_scales_with_spend():
    assert get_monthly_token_cap("pro") == int(5.94 * 375_000)


def test_resolve_plan_expired_trial_becomes_free():
    row = {
        "id": "u1",
        "plan": "trial",
        "trial_ends_at": "2020-01-01T00:00:00+00:00",
    }
    info = resolve_plan(row)
    assert info["plan"] == "free"


def test_monthly_caps_dict_matches_helpers():
    for plan, cap in MONTHLY_SPEND_CAP_USD_BY_PLAN.items():
        assert get_monthly_spend_cap(plan) == cap
