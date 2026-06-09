"""DDL for habits tables."""

TABLES = """
CREATE TABLE IF NOT EXISTS streaks (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    name        TEXT NOT NULL,
    emoji       TEXT DEFAULT '',
    target_days INTEGER,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS streak_days (
    id          TEXT PRIMARY KEY,
    streak_id   TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    date_key    TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    UNIQUE(streak_id, date_key)
);

CREATE TABLE IF NOT EXISTS reset_completions (
    id                TEXT PRIMARY KEY,
    user_id           TEXT NOT NULL,
    anchor_id         TEXT NOT NULL,
    date_key          TEXT NOT NULL,
    duration          INTEGER NOT NULL,
    pre_mood          TEXT,
    post_mood         TEXT,
    note              TEXT,
    marked_for_streak INTEGER DEFAULT 0,
    created_at        TEXT NOT NULL
);
"""
