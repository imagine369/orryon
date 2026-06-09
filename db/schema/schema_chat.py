"""DDL for chat tables."""

TABLES = """
CREATE TABLE IF NOT EXISTS chat_sessions (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    title       TEXT DEFAULT '',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    summary  TEXT DEFAULT '',
    summary_message_count  INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    session_id  TEXT DEFAULT '',
    role        TEXT NOT NULL,
    content     TEXT NOT NULL,
    agent       TEXT,
    status      TEXT,
    summary     TEXT,
    confidence  INTEGER,
    evidence    TEXT,
    next_steps  TEXT,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_memory (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    fact        TEXT NOT NULL,
    category    TEXT DEFAULT 'general',
    source      TEXT DEFAULT 'conversation',
    created_at  TEXT NOT NULL,
    confidence  REAL DEFAULT 1.0,
    UNIQUE(user_id, fact)
);
"""
