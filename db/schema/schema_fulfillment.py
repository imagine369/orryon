"""DDL for instant fulfillment handoffs (deeplink orchestration, no partner checkout)."""

TABLES = """
CREATE TABLE IF NOT EXISTS fulfillment_handoffs (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    type            TEXT NOT NULL,
    title           TEXT NOT NULL,
    subtitle        TEXT DEFAULT '',
    action_label    TEXT DEFAULT 'Open',
    action_url      TEXT NOT NULL,
    metadata_json   TEXT DEFAULT '{}',
    status          TEXT DEFAULT 'pending',
    created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fulfillment_url_cache (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    cache_key       TEXT NOT NULL,
    url             TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    UNIQUE(user_id, cache_key)
);
"""
