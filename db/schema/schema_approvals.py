"""DDL for approvals tables."""

TABLES = """
CREATE TABLE IF NOT EXISTS approval_requests (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL,
    action_type  TEXT NOT NULL,
    description  TEXT NOT NULL,
    payload_json TEXT DEFAULT '{}',
    status       TEXT DEFAULT 'pending',
    created_at   TEXT NOT NULL,
    expires_at   TEXT DEFAULT '',
    resolved_at  TEXT DEFAULT ''
);
"""
