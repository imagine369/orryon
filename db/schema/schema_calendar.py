"""DDL for calendar integration tables."""

TABLES = """
CREATE TABLE IF NOT EXISTS user_calendar_tokens (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL UNIQUE,
    tokens     TEXT NOT NULL,
    created_at TEXT,
    updated_at TEXT
);
"""
