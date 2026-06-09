"""DDL for briefings tables."""

TABLES = """
CREATE TABLE IF NOT EXISTS briefings (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL,
    date         TEXT NOT NULL,
    content_json TEXT DEFAULT '{}',
    delivered_at TEXT DEFAULT '',
    read_at      TEXT DEFAULT '',
    UNIQUE(user_id, date)
);
"""
