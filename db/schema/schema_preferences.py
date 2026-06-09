"""DDL for preferences tables."""

TABLES = """
CREATE TABLE IF NOT EXISTS user_preferences (
    user_id               TEXT PRIMARY KEY,
    last_reset_anchor     TEXT,
    voice_overlay_enabled INTEGER DEFAULT 0,
    golden_mode_enabled   INTEGER DEFAULT 0,
    briefing_time         TEXT DEFAULT '07:00',
    briefing_includes     TEXT DEFAULT 'finance,health,calendar,goals',
    onboarding_complete   INTEGER DEFAULT 0,
    life_priorities  TEXT DEFAULT '',
    life_priorities_set  INTEGER DEFAULT 0
);
"""
