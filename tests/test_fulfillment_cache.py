"""Tests for fulfillment URL cache upsert."""
from __future__ import annotations

from core.integrations.fulfillment.cache import get_cached_url, set_cached_url
from db.auth import get_or_create_user_by_email
from db.connection import get_connection


def test_set_cached_url_upserts_without_duplicate_rows():
    user = get_or_create_user_by_email("pytest-fulfillment-cache@orryon.app")
    uid = user["id"]
    key = "delivery:https://example.com/store"

    set_cached_url(uid, key, "https://first.example/url")
    assert get_cached_url(uid, key) == "https://first.example/url"

    set_cached_url(uid, key, "https://second.example/url")
    assert get_cached_url(uid, key) == "https://second.example/url"

    with get_connection() as conn:
        count = conn.execute(
            "SELECT COUNT(*) AS n FROM fulfillment_url_cache WHERE user_id=? AND cache_key=?",
            (uid, key[:200]),
        ).fetchone()
    n = count["n"] if isinstance(count, dict) else count[0]
    assert n == 1
