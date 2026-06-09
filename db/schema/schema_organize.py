"""DDL for organize tables."""

TABLES = """
CREATE TABLE IF NOT EXISTS notes (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    title           TEXT NOT NULL,
    content         TEXT,
    tags            TEXT,
    linked_account  TEXT,
    linked_goal     TEXT,
    is_pinned       INTEGER DEFAULT 0,
    mood            TEXT DEFAULT '',
    created_at      TEXT,
    updated_at      TEXT,
    is_journal  INTEGER DEFAULT 0,
    entry_date  TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS events (
    id                    TEXT PRIMARY KEY,
    user_id               TEXT NOT NULL,
    title                 TEXT NOT NULL,
    description           TEXT,
    event_date            TEXT NOT NULL,
    event_type            TEXT,
    amount                REAL DEFAULT 0,
    account_id            TEXT,
    is_recurring          INTEGER DEFAULT 0,
    recurrence            TEXT,
    is_synced_to_google   INTEGER DEFAULT 0,
    reminder_minutes      INTEGER DEFAULT 30,
    reminder_sent         INTEGER DEFAULT 0,
    external_uid          TEXT,
    created_at            TEXT
);

CREATE TABLE IF NOT EXISTS action_items (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    title       TEXT NOT NULL,
    description TEXT,
    priority    TEXT DEFAULT 'medium',
    status      TEXT DEFAULT 'open',
    due_date    TEXT,
    category    TEXT,
    created_by  TEXT DEFAULT 'edward',
    created_at  TEXT NOT NULL,
    updated_at  TEXT,
    sort_order  INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS grocery_items (
    id               TEXT PRIMARY KEY,
    user_id          TEXT NOT NULL,
    name             TEXT NOT NULL,
    quantity         TEXT DEFAULT '1',
    estimated_price  REAL DEFAULT 0,
    is_checked       INTEGER DEFAULT 0,
    sort_order       INTEGER DEFAULT 0,
    added_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_lists (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    name       TEXT NOT NULL,
    icon       TEXT DEFAULT '',
    color      TEXT DEFAULT '#ffffff',
    sort_order INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS list_items (
    id         TEXT PRIMARY KEY,
    list_id    TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    name       TEXT NOT NULL,
    notes      TEXT DEFAULT '',
    is_checked INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    added_at   TEXT NOT NULL
);
"""
