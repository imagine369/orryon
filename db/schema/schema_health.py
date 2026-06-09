"""DDL for health tables."""

TABLES = """
CREATE TABLE IF NOT EXISTS health_vitals (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    type        TEXT NOT NULL,
    value       REAL NOT NULL,
    unit        TEXT DEFAULT '',
    source      TEXT DEFAULT 'manual',
    note        TEXT DEFAULT '',
    recorded_at TEXT NOT NULL,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS medications (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL,
    name         TEXT NOT NULL,
    dose         TEXT DEFAULT '',
    frequency    TEXT DEFAULT 'daily',
    next_dose_at TEXT DEFAULT '',
    notes        TEXT DEFAULT '',
    active       INTEGER DEFAULT 1,
    created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS health_appointments (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL,
    type         TEXT DEFAULT '',
    provider     TEXT DEFAULT '',
    date         TEXT NOT NULL,
    location     TEXT DEFAULT '',
    notes        TEXT DEFAULT '',
    created_at   TEXT NOT NULL
);
"""
