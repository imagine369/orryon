"""DDL for links tables."""

TABLES = """
CREATE TABLE IF NOT EXISTS links (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    title       TEXT NOT NULL,
    url         TEXT NOT NULL,
    description TEXT,
    tags        TEXT,
    favicon_url TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT
);

CREATE TABLE IF NOT EXISTS inspo_images (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    title       TEXT,
    file_path   TEXT NOT NULL,
    description TEXT,
    tags        TEXT,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS link_pages (
    id           TEXT PRIMARY KEY,
    user_id      TEXT UNIQUE NOT NULL,
    share_token  TEXT UNIQUE NOT NULL,
    page_title   TEXT DEFAULT '',
    bio          TEXT DEFAULT '',
    is_public    INTEGER DEFAULT 0,
    theme        TEXT DEFAULT 'dark',
    created_at   TEXT NOT NULL,
    updated_at   TEXT
);
"""
