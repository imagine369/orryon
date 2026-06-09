"""DDL for usage tables."""

TABLES = """
CREATE TABLE IF NOT EXISTS chat_message_counts (
    id       TEXT PRIMARY KEY,
    user_id  TEXT NOT NULL,
    month    TEXT NOT NULL,
    count    INTEGER DEFAULT 0,
    UNIQUE(user_id, month)
);

CREATE TABLE IF NOT EXISTS voice_minute_usage (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL,
    month        TEXT NOT NULL,
    seconds_used REAL DEFAULT 0,
    updated_at   TEXT NOT NULL,
    UNIQUE(user_id, month)
);

CREATE TABLE IF NOT EXISTS voice_topups (
    id                    TEXT PRIMARY KEY,
    user_id               TEXT NOT NULL,
    minutes_added         INTEGER NOT NULL,
    price_usd             REAL NOT NULL,
    stripe_payment_intent TEXT DEFAULT '',
    created_at            TEXT NOT NULL
);
"""
