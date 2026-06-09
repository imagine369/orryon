"""DDL for location tables."""

TABLES = """
CREATE TABLE IF NOT EXISTS user_places (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    label      TEXT NOT NULL,
    address    TEXT DEFAULT '',
    lat        REAL DEFAULT 0,
    lng        REAL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS commute_patterns (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    from_place  TEXT DEFAULT '',
    to_place    TEXT DEFAULT '',
    days        TEXT DEFAULT '',
    depart_time TEXT DEFAULT '',
    created_at  TEXT NOT NULL
);
"""
