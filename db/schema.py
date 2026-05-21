"""
db.schema — Schema DDL, init_db, and column migrations.
"""
from __future__ import annotations

import logging
import sqlite3

from config import DB_PATH
from db.connection import _USE_PG, _pg_pool

logger = logging.getLogger(__name__)

# ── Schema ─────────────────────────────────────────────────────────────────────

_SCHEMA_TABLES = """
CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    display_name  TEXT,
    created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS verification_codes (
    id          TEXT PRIMARY KEY,
    email       TEXT NOT NULL,
    code_hash   TEXT NOT NULL,
    expires_at  TEXT NOT NULL,
    used        INTEGER DEFAULT 0,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_sessions (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    title       TEXT DEFAULT '',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
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

CREATE TABLE IF NOT EXISTS accounts (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL,
    name          TEXT NOT NULL,
    type          TEXT NOT NULL,
    institution   TEXT,
    balance       REAL DEFAULT 0,
    currency      TEXT DEFAULT 'USD',
    last_updated  TEXT,
    metadata      TEXT
);

CREATE TABLE IF NOT EXISTS transactions (
    id           TEXT PRIMARY KEY,
    account_id   TEXT,
    user_id      TEXT NOT NULL,
    date         TEXT NOT NULL,
    amount       REAL NOT NULL,
    description  TEXT,
    category     TEXT,
    subcategory  TEXT,
    is_recurring INTEGER DEFAULT 0,
    merchant     TEXT,
    metadata     TEXT
);

CREATE TABLE IF NOT EXISTS holdings (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL,
    account_id   TEXT,
    symbol       TEXT NOT NULL,
    name         TEXT,
    quantity     REAL DEFAULT 0,
    cost_basis   REAL DEFAULT 0,
    asset_type   TEXT,
    last_updated TEXT
);

CREATE TABLE IF NOT EXISTS goals (
    id                     TEXT PRIMARY KEY,
    user_id                TEXT NOT NULL,
    name                   TEXT NOT NULL,
    target_amount          REAL NOT NULL,
    current_amount         REAL DEFAULT 0,
    target_date            TEXT,
    category               TEXT,
    linked_budget_category TEXT DEFAULT '',
    notes                  TEXT,
    created_at             TEXT,
    is_completed           INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS goal_contributions (
    id         TEXT PRIMARY KEY,
    goal_id    TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    amount     REAL NOT NULL,
    note       TEXT,
    created_at TEXT NOT NULL
);

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
    updated_at      TEXT
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

CREATE TABLE IF NOT EXISTS subscriptions (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    name            TEXT NOT NULL,
    amount          REAL DEFAULT 0,
    frequency       TEXT DEFAULT 'monthly',
    next_due        TEXT,
    category        TEXT,
    account_id      TEXT,
    is_active       INTEGER DEFAULT 1,
    detected_at     TEXT,
    previous_amount REAL DEFAULT 0,
    last_changed    TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS credit_scores (
    id       TEXT PRIMARY KEY,
    user_id  TEXT NOT NULL,
    score    INTEGER NOT NULL,
    provider TEXT,
    date     TEXT NOT NULL,
    factors  TEXT
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

CREATE TABLE IF NOT EXISTS budget_categories (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    category    TEXT NOT NULL,
    planned     REAL DEFAULT 0,
    month       TEXT NOT NULL,
    created_at  TEXT,
    rollover    INTEGER DEFAULT 0,
    UNIQUE(user_id, category, month)
);

CREATE TABLE IF NOT EXISTS budget_templates (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    category    TEXT NOT NULL,
    planned     REAL DEFAULT 0,
    rollover    INTEGER DEFAULT 0,
    created_at  TEXT,
    updated_at  TEXT,
    UNIQUE(user_id, category)
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

CREATE TABLE IF NOT EXISTS custom_categories (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    name        TEXT NOT NULL,
    color       TEXT DEFAULT '#6366f1',
    icon        TEXT DEFAULT '',
    is_active   INTEGER DEFAULT 1,
    created_at  TEXT NOT NULL,
    UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS share_tokens (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    token       TEXT UNIQUE NOT NULL,
    view_type   TEXT DEFAULT 'finance_readonly',
    is_active   INTEGER DEFAULT 1,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_memory (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    fact        TEXT NOT NULL,
    category    TEXT DEFAULT 'general',
    source      TEXT DEFAULT 'conversation',
    created_at  TEXT NOT NULL,
    UNIQUE(user_id, fact)
);

CREATE TABLE IF NOT EXISTS recurring_income (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    name        TEXT NOT NULL,
    amount      REAL NOT NULL,
    frequency   TEXT DEFAULT 'monthly',
    source      TEXT DEFAULT '',
    next_date   TEXT,
    is_active   INTEGER DEFAULT 1,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS net_worth_snapshots (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    total_assets    REAL DEFAULT 0,
    total_liabilities REAL DEFAULT 0,
    net_worth       REAL DEFAULT 0,
    snapshot_date   TEXT NOT NULL,
    UNIQUE(user_id, snapshot_date)
);

CREATE TABLE IF NOT EXISTS user_api_spend (
    id                TEXT PRIMARY KEY,
    user_id           TEXT NOT NULL,
    month             TEXT NOT NULL,
    prompt_tokens     INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    cost_usd          REAL DEFAULT 0,
    updated_at        TEXT NOT NULL,
    UNIQUE(user_id, month)
);

CREATE TABLE IF NOT EXISTS waitlist (
    id            TEXT PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    approved      INTEGER DEFAULT 0,
    created_at    TEXT NOT NULL,
    approve_token TEXT DEFAULT ''
);

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

CREATE TABLE IF NOT EXISTS user_preferences (
    user_id               TEXT PRIMARY KEY,
    last_reset_anchor     TEXT,
    voice_overlay_enabled INTEGER DEFAULT 0,
    golden_mode_enabled   INTEGER DEFAULT 0,
    briefing_time         TEXT DEFAULT '07:00',
    briefing_includes     TEXT DEFAULT 'finance,health,calendar,goals',
    onboarding_complete   INTEGER DEFAULT 0
);

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

CREATE TABLE IF NOT EXISTS briefings (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL,
    date         TEXT NOT NULL,
    content_json TEXT DEFAULT '{}',
    delivered_at TEXT DEFAULT '',
    read_at      TEXT DEFAULT '',
    UNIQUE(user_id, date)
);

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

CREATE TABLE IF NOT EXISTS chat_message_counts (
    id       TEXT PRIMARY KEY,
    user_id  TEXT NOT NULL,
    month    TEXT NOT NULL,
    count    INTEGER DEFAULT 0,
    UNIQUE(user_id, month)
);

CREATE TABLE IF NOT EXISTS auth_sessions (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    device_name TEXT DEFAULT '',
    ip_address  TEXT DEFAULT '',
    created_at  TEXT NOT NULL,
    last_active TEXT NOT NULL,
    revoked     INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS voice_minute_usage (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL,
    month        TEXT NOT NULL,
    seconds_used REAL DEFAULT 0,
    updated_at   TEXT NOT NULL,
    UNIQUE(user_id, month)
);

CREATE TABLE IF NOT EXISTS voice_topups (
    id                    TEXT PRIMARY KEY,
    user_id               TEXT NOT NULL,
    minutes_added         INTEGER NOT NULL,
    price_usd             REAL NOT NULL,
    stripe_payment_intent TEXT DEFAULT '',
    created_at            TEXT NOT NULL
);
"""

_SCHEMA_INDEXES = """
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_created ON chat_messages(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date);
CREATE INDEX IF NOT EXISTS idx_events_user_date ON events(user_id, event_date);
CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_user_updated ON notes(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_verification_codes_email ON verification_codes(email, expires_at);
CREATE INDEX IF NOT EXISTS idx_user_lists_user ON user_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_list_items_list ON list_items(list_id);
CREATE INDEX IF NOT EXISTS idx_budget_categories_user_month ON budget_categories(user_id, month);
CREATE INDEX IF NOT EXISTS idx_budget_templates_user ON budget_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_user_memory_user ON user_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_streaks_user ON streaks(user_id);
CREATE INDEX IF NOT EXISTS idx_streak_days_streak ON streak_days(streak_id);
CREATE INDEX IF NOT EXISTS idx_streak_days_user_date ON streak_days(user_id, date_key);
CREATE INDEX IF NOT EXISTS idx_reset_completions_user ON reset_completions(user_id);
CREATE INDEX IF NOT EXISTS idx_reset_completions_user_date ON reset_completions(user_id, date_key);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_revoked ON auth_sessions(user_id, revoked);
CREATE INDEX IF NOT EXISTS idx_voice_usage_user_month ON voice_minute_usage(user_id, month);
CREATE INDEX IF NOT EXISTS idx_voice_topups_user ON voice_topups(user_id);
CREATE INDEX IF NOT EXISTS idx_health_vitals_user ON health_vitals(user_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_medications_user ON medications(user_id);
CREATE INDEX IF NOT EXISTS idx_health_appts_user ON health_appointments(user_id, date);
CREATE INDEX IF NOT EXISTS idx_user_places_user ON user_places(user_id);
CREATE INDEX IF NOT EXISTS idx_commute_user ON commute_patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_briefings_user_date ON briefings(user_id, date);
CREATE INDEX IF NOT EXISTS idx_approvals_user ON approval_requests(user_id, status);
CREATE INDEX IF NOT EXISTS idx_chat_counts_user_month ON chat_message_counts(user_id, month);
"""

# Additional columns that may be missing on older databases.
# For Postgres these are included in the CREATE TABLE; for SQLite we ALTER.
_USERS_EXTRA_COLS = {
    "default_reminder_minutes": "INTEGER DEFAULT 30",
    "daily_digest_enabled": "INTEGER DEFAULT 1",
    "daily_digest_time": "TEXT DEFAULT '08:00'",
    "last_digest_sent": "TEXT DEFAULT ''",
    "weekly_report_enabled": "INTEGER DEFAULT 1",
    "last_weekly_report": "TEXT DEFAULT ''",
    "currency": "TEXT DEFAULT 'USD'",
    "budget_cycle_start": "INTEGER DEFAULT 1",
    "spending_alert_pct": "INTEGER DEFAULT 80",
    "bill_due_alert_days": "INTEGER DEFAULT 3",
    "plan": "TEXT DEFAULT 'free'",
    "trial_ends_at": "TEXT DEFAULT ''",
    "stripe_customer_id": "TEXT DEFAULT ''",
    "stripe_subscription_id": "TEXT DEFAULT ''",
    "segment": "TEXT DEFAULT ''",
    "billing_interval": "TEXT DEFAULT ''",
}

_TRANSACTIONS_EXTRA_COLS = {
    "currency": "TEXT DEFAULT 'USD'",
    "attachment_path": "TEXT DEFAULT ''",
}

_NOTES_EXTRA_COLS = {
    "is_journal": "INTEGER DEFAULT 0",
    "entry_date": "TEXT DEFAULT ''",
}

# Per-signup single-use token for the admin "one-click approve" email link.
# Having this on the row (instead of a shared ADMIN_SECRET in the URL) means a
# leaked approve URL can only approve one specific pending signup, once, and is
# useless the moment it's clicked. See backend/routers/waitlist.py for usage.
_WAITLIST_EXTRA_COLS = {
    "approve_token": "TEXT DEFAULT ''",
}


def init_db() -> None:
    """Create all tables if they don't exist. Safe to call multiple times."""
    if _USE_PG and _pg_pool:
        _init_db_pg()
    else:
        _init_db_sqlite()


def _init_db_pg() -> None:
    """Postgres schema initialisation."""
    conn = _pg_pool.getconn()
    try:
        cur = conn.cursor()
        for stmt in _SCHEMA_TABLES.strip().split(";"):
            stmt = stmt.strip()
            if stmt:
                cur.execute(stmt)
        for stmt in _SCHEMA_INDEXES.strip().split(";"):
            stmt = stmt.strip()
            if stmt:
                cur.execute(stmt)
        _migrate_extra_cols_pg(cur, "users", _USERS_EXTRA_COLS)
        _migrate_extra_cols_pg(cur, "transactions", _TRANSACTIONS_EXTRA_COLS)
        _migrate_extra_cols_pg(cur, "notes", _NOTES_EXTRA_COLS)
        _migrate_extra_cols_pg(cur, "waitlist", _WAITLIST_EXTRA_COLS)
        conn.commit()
        logger.info("Postgres schema initialised")
    except Exception as exc:
        conn.rollback()
        logger.error("Postgres init_db failed: %s", exc)
    finally:
        _pg_pool.putconn(conn)


def _migrate_extra_cols_pg(cur, table: str, cols: dict) -> None:
    """Add missing columns to a Postgres table (safe, uses IF NOT EXISTS pattern)."""
    for col_name, col_def in cols.items():
        try:
            cur.execute(
                f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col_name} {col_def}"
            )
        except Exception:
            pass


def _init_db_sqlite() -> None:
    """SQLite schema initialisation (legacy path)."""
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    cur = conn.cursor()
    cur.executescript(_SCHEMA_TABLES)
    cur.executescript(_SCHEMA_INDEXES)
    conn.commit()
    _migrate_sqlite_cols(conn, "users", _USERS_EXTRA_COLS)
    _migrate_sqlite_cols(conn, "transactions", _TRANSACTIONS_EXTRA_COLS)
    _migrate_sqlite_cols(conn, "notes", _NOTES_EXTRA_COLS)
    _migrate_sqlite_cols(conn, "waitlist", _WAITLIST_EXTRA_COLS)
    conn.commit()
    conn.close()
    logger.info("SQLite database initialised at: %s", DB_PATH)


def _migrate_sqlite_cols(conn, table: str, cols: dict) -> None:
    """Add missing columns to a SQLite table."""
    try:
        existing = {r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}
        for col_name, col_def in cols.items():
            if col_name not in existing:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_def}")
        conn.commit()
    except Exception as exc:
        logger.warning("_migrate_sqlite_cols(%s): %s", table, exc)


