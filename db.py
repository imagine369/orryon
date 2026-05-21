"""
db.py — Database setup and helpers for orryon.

Supports two backends:
  - PostgreSQL (Supabase) when DATABASE_URL is set — for production
  - SQLite fallback when DATABASE_URL is not set — for local dev

All callers use the same API: get_connection(), insert_row(), fetch_rows(), etc.
The _DbConn wrapper normalises SQL dialect differences (? vs %s, INSERT OR REPLACE
vs ON CONFLICT) so no caller code needs to know which backend is active.
"""

from __future__ import annotations

import hashlib
import os
import random
import sqlite3
import logging
import uuid
from datetime import datetime, timedelta, timezone

from config import DB_PATH, DATABASE_URL, ENCRYPTION_KEY

logger = logging.getLogger(__name__)

# ── At-rest encryption (Fernet) ───────────────────────────────────────────────
# Encrypts sensitive financial fields (balances, amounts) stored in the DB.
# Enabled when ENCRYPTION_KEY is set. Transparent passthrough otherwise.

_fernet = None
if ENCRYPTION_KEY:
    try:
        from cryptography.fernet import Fernet
        _fernet = Fernet(ENCRYPTION_KEY.encode() if isinstance(ENCRYPTION_KEY, str) else ENCRYPTION_KEY)
        logger.info("At-rest encryption enabled (Fernet)")
    except Exception as exc:
        logger.error("ENCRYPTION_KEY is set but invalid — encryption disabled: %s", exc)


def encrypt_value(value: str) -> str:
    """Encrypt a string value for storage. Returns plaintext if no key configured."""
    if _fernet is None:
        return value
    return _fernet.encrypt(value.encode("utf-8")).decode("utf-8")


def decrypt_value(value: str) -> str:
    """Decrypt a stored value. Returns as-is if not encrypted or no key configured."""
    if _fernet is None:
        return value
    try:
        return _fernet.decrypt(value.encode("utf-8")).decode("utf-8")
    except Exception:
        return value  # not encrypted (legacy data) — passthrough

# ── Backend detection ──────────────────────────────────────────────────────────

_USE_PG = bool(DATABASE_URL)
_pg_pool = None  # Initialised by init_pool() at app startup


def init_pool() -> None:
    """Create the Postgres connection pool. Called from FastAPI lifespan."""
    global _pg_pool
    if not _USE_PG:
        return
    from psycopg_pool import ConnectionPool
    from psycopg.rows import dict_row
    _pg_pool = ConnectionPool(
        conninfo=DATABASE_URL,
        min_size=2,
        max_size=20,
        kwargs={"row_factory": dict_row, "autocommit": False},
    )
    logger.info("Postgres connection pool created (min=2, max=20)")


def close_pool() -> None:
    """Shut down the Postgres pool. Called from FastAPI lifespan."""
    global _pg_pool
    if _pg_pool:
        _pg_pool.close()
        _pg_pool = None


# ── Connection wrapper ─────────────────────────────────────────────────────────

class _PgCursor:
    """Wraps a psycopg cursor, converting ? to %s and normalising results."""
    __slots__ = ("_cur",)

    def __init__(self, cur):
        self._cur = cur

    def execute(self, sql: str, params=None):
        sql = sql.replace("?", "%s")
        self._cur.execute(sql, params or ())
        return self

    def executescript(self, sql: str):
        for stmt in sql.strip().split(";"):
            stmt = stmt.strip()
            if stmt:
                self._cur.execute(stmt)
        return self

    def fetchone(self):
        return self._cur.fetchone()

    def fetchall(self):
        return self._cur.fetchall()

    def __iter__(self):
        return iter(self._cur)


class _DbConn:
    """
    Unified connection wrapper. Converts ? to %s for Postgres, returns pooled
    connections on close(), and makes rows behave like dicts for both backends.
    """
    __slots__ = ("_conn", "_is_pg")

    def __init__(self, conn, is_pg: bool):
        self._conn = conn
        self._is_pg = is_pg

    def execute(self, sql: str, params=None):
        if self._is_pg:
            sql = sql.replace("?", "%s")
            result = self._conn.execute(sql, params or ())
            return _PgCursor(result)
        return self._conn.execute(sql, params or ())

    def cursor(self):
        if self._is_pg:
            return _PgCursor(self._conn.cursor())
        return self._conn.cursor()

    def commit(self):
        self._conn.commit()

    def close(self):
        if self._is_pg and _pg_pool:
            _pg_pool.putconn(self._conn)
        else:
            self._conn.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()


def get_connection() -> _DbConn:
    """Return a database connection (Postgres pool or SQLite)."""
    if _USE_PG and _pg_pool:
        conn = _pg_pool.getconn()
        return _DbConn(conn, is_pg=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return _DbConn(conn, is_pg=False)


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


# ── Generic CRUD helpers ──────────────────────────────────────────────────────

_ALLOWED_TABLES: frozenset[str] = frozenset({
    "users", "transactions", "accounts", "holdings", "goals", "notes", "events",
    "subscriptions", "credit_scores", "action_items", "links", "inspo_images",
    "budget_categories", "budget_templates", "grocery_items", "custom_categories",
    "share_tokens", "user_memory", "recurring_income", "net_worth_snapshots",
    "link_pages", "chat_messages", "chat_sessions", "verification_codes",
    "user_calendar_tokens", "goal_contributions", "user_lists", "list_items",
    "auth_sessions", "streaks", "streak_days", "reset_completions",
    "user_preferences", "waitlist", "contact_submissions",
    "voice_minute_usage", "voice_topups",
    "health_vitals", "medications", "health_appointments",
    "user_places", "commute_patterns", "briefings", "approval_requests",
    "chat_message_counts",
})


def _validate_table(table: str) -> str:
    """Validate a table name against the allowlist to prevent SQL injection."""
    if table not in _ALLOWED_TABLES:
        raise ValueError(f"Disallowed table name: {table!r}")
    return table


def _ph(n: int) -> str:
    """Return n placeholders for the current backend."""
    p = "%s" if _USE_PG else "?"
    return ", ".join(p for _ in range(n))


def insert_row(table: str, data: dict) -> bool:
    """Insert a row. Uses ON CONFLICT for Postgres, INSERT OR REPLACE for SQLite."""
    try:
        _validate_table(table)
        cols = ", ".join(data.keys())
        placeholders = _ph(len(data))
        values = list(data.values())
        conn = get_connection()
        if _USE_PG:
            set_clause = ", ".join(f"{k} = EXCLUDED.{k}" for k in data if k != "id")
            conn.execute(
                f"INSERT INTO {table} ({cols}) VALUES ({placeholders}) "
                f"ON CONFLICT (id) DO UPDATE SET {set_clause}",
                values,
            )
        else:
            conn.execute(
                f"INSERT OR REPLACE INTO {table} ({cols}) VALUES ({placeholders})",
                values,
            )
        conn.commit()
        conn.close()
        return True
    except Exception as exc:
        logger.error("insert_row(%s) error: %s", table, exc)
        return False


def fetch_rows(table: str, where: dict | None = None, limit: int = 500) -> list[dict]:
    """Fetch rows from *table* with optional equality filters."""
    try:
        _validate_table(table)
        conn = get_connection()
        ph = "%s" if _USE_PG else "?"
        query = f"SELECT * FROM {table}"
        params: list = []
        if where:
            conditions = " AND ".join(f"{k} = {ph}" for k in where)
            query += f" WHERE {conditions}"
            params = list(where.values())
        query += f" LIMIT {limit}"
        rows = conn.execute(query, params).fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as exc:
        logger.error("fetch_rows(%s) error: %s", table, exc)
        return []


def update_row(table: str, data: dict, where: dict) -> bool:
    """Update rows in *table* matching *where* conditions with *data* values."""
    try:
        _validate_table(table)
        ph = "%s" if _USE_PG else "?"
        set_clause = ", ".join(f"{k} = {ph}" for k in data)
        where_clause = " AND ".join(f"{k} = {ph}" for k in where)
        params = list(data.values()) + list(where.values())
        conn = get_connection()
        conn.execute(f"UPDATE {table} SET {set_clause} WHERE {where_clause}", params)
        conn.commit()
        conn.close()
        return True
    except Exception as exc:
        logger.error("update_row(%s) error: %s", table, exc)
        return False


def delete_row(table: str, where: dict) -> bool:
    """Delete rows from *table* matching *where* conditions."""
    try:
        _validate_table(table)
        ph = "%s" if _USE_PG else "?"
        where_clause = " AND ".join(f"{k} = {ph}" for k in where)
        conn = get_connection()
        conn.execute(f"DELETE FROM {table} WHERE {where_clause}", list(where.values()))
        conn.commit()
        conn.close()
        return True
    except Exception as exc:
        logger.error("delete_row(%s) error: %s", table, exc)
        return False


# ── OTP helpers ───────────────────────────────────────────────────────────────

def _hash_code(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


# ── User auth (email OTP — no passwords stored) ───────────────────────────────

def get_or_create_user_by_email(
    email: str, display_name: str = "", segment: str = ""
) -> dict:
    """Return the existing user for *email*, or create a new one.

    Free-breathing signups (segment='free_breathe') get plan='free' with no
    trial period — they are stored under the 'Free Breathe Users' segment and
    never automatically promoted to trial.
    """
    email = email.strip().lower()
    try:
        conn = get_connection()
        row = conn.execute(
            "SELECT * FROM users WHERE email = ? LIMIT 1", (email,)
        ).fetchone()
        conn.close()
        if row:
            return dict(row)
    except Exception as exc:
        logger.error("get_or_create_user_by_email lookup error: %s", exc)

    name = display_name.strip() or email.split("@")[0]
    is_free_breathe = segment == "free_breathe"

    if is_free_breathe:
        user = {
            "id": str(uuid.uuid4()),
            "email": email,
            "display_name": name,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "plan": "free",
            "trial_ends_at": "",
            "segment": "free_breathe",
        }
        insert_row("users", user)
        logger.info("Created Free Breathe user: %s (%s)", email, user["id"])
    else:
        from config import TRIAL_DAYS
        trial_ends_at = (datetime.now(timezone.utc) + timedelta(days=TRIAL_DAYS)).isoformat()
        user = {
            "id": str(uuid.uuid4()),
            "email": email,
            "display_name": name,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "plan": "trial",
            "trial_ends_at": trial_ends_at,
            "segment": segment,
        }
        insert_row("users", user)
        logger.info("Created user: %s (%s) — trial until %s", email, user["id"], trial_ends_at)

    return user


def create_verification_code(email: str) -> str:
    """Generate a 6-digit OTP. Stores SHA-256 hash with 10-minute expiry."""
    email = email.strip().lower()
    code = f"{random.SystemRandom().randint(0, 999999):06d}"
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
    insert_row("verification_codes", {
        "id": str(uuid.uuid4()),
        "email": email,
        "code_hash": _hash_code(code),
        "expires_at": expires_at,
        "used": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return code


_OTP_MAX_ATTEMPTS = 5
_OTP_LOCKOUT_MINUTES = 15

# In-memory lockout tracker: email -> (attempt_count, first_attempt_epoch)
_otp_attempts: dict[str, tuple[int, float]] = {}


def _check_otp_lockout(email: str) -> bool:
    """Return True if the email is currently locked out from OTP attempts."""
    import time
    entry = _otp_attempts.get(email)
    if not entry:
        return False
    count, first_ts = entry
    if time.time() - first_ts > _OTP_LOCKOUT_MINUTES * 60:
        _otp_attempts.pop(email, None)
        return False
    return count >= _OTP_MAX_ATTEMPTS


def _record_otp_failure(email: str) -> None:
    """Increment failed OTP attempt counter for the email."""
    import time
    entry = _otp_attempts.get(email)
    now = time.time()
    if not entry or now - entry[1] > _OTP_LOCKOUT_MINUTES * 60:
        _otp_attempts[email] = (1, now)
    else:
        _otp_attempts[email] = (entry[0] + 1, entry[1])


def _clear_otp_attempts(email: str) -> None:
    """Reset the failed attempt counter on successful verification."""
    _otp_attempts.pop(email, None)


def verify_code(email: str, code: str) -> bool:
    """Check OTP validity. Marks as used on success. Enforces lockout after repeated failures."""
    email = email.strip().lower()
    if _check_otp_lockout(email):
        return False
    code_hash = _hash_code(code.strip())
    now = datetime.now(timezone.utc).isoformat()
    try:
        conn = get_connection()
        row = conn.execute(
            "SELECT id FROM verification_codes "
            "WHERE email = ? AND code_hash = ? AND used = 0 AND expires_at > ? "
            "ORDER BY created_at DESC LIMIT 1",
            (email, code_hash, now),
        ).fetchone()
        if not row:
            conn.close()
            _record_otp_failure(email)
            return False
        conn.execute("UPDATE verification_codes SET used = 1 WHERE id = ?", (row["id"],))
        conn.commit()
        conn.close()
        _clear_otp_attempts(email)
        return True
    except Exception as exc:
        logger.error("verify_code error: %s", exc)
        return False


# ── Chat persistence ──────────────────────────────────────────────────────────

def save_chat_message(user_id: str, msg: dict, session_id: str = "") -> bool:
    now = datetime.now(timezone.utc).isoformat()
    row = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "session_id": session_id,
        "role": msg.get("role", "user"),
        "content": msg.get("content", ""),
        "agent": msg.get("agent", ""),
        "status": msg.get("status", ""),
        "summary": msg.get("summary", ""),
        "confidence": msg.get("confidence", 0),
        "evidence": msg.get("evidence", ""),
        "next_steps": msg.get("next_steps_or_question", ""),
        "created_at": now,
    }
    ok = insert_row("chat_messages", row)
    if ok and session_id:
        try:
            conn = get_connection()
            conn.execute("UPDATE chat_sessions SET updated_at=? WHERE id=?", (now, session_id))
            conn.commit()
            conn.close()
        except Exception:
            pass
    return ok


def load_chat_history(user_id: str, limit: int = 100, session_id: str = "") -> list[dict]:
    try:
        conn = get_connection()
        if session_id:
            rows = conn.execute(
                "SELECT * FROM ("
                "  SELECT * FROM chat_messages"
                "  WHERE user_id = ? AND session_id = ?"
                "  ORDER BY created_at DESC LIMIT ?"
                ") sub ORDER BY created_at ASC",
                (user_id, session_id, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM ("
                "  SELECT * FROM chat_messages"
                "  WHERE user_id = ?"
                "  ORDER BY created_at DESC LIMIT ?"
                ") sub ORDER BY created_at ASC",
                (user_id, limit),
            ).fetchall()
        conn.close()
        msgs = []
        for r in rows:
            d = dict(r)
            d["next_steps_or_question"] = d.pop("next_steps", "")
            msgs.append(d)
        return msgs
    except Exception as exc:
        logger.error("load_chat_history error: %s", exc)
        return []


# ── Chat session helpers ──────────────────────────────────────────────────────

def create_chat_session(user_id: str, title: str = "") -> dict:
    now = datetime.now(timezone.utc).isoformat()
    session_id = str(uuid.uuid4())
    insert_row("chat_sessions", {
        "id": session_id, "user_id": user_id, "title": title,
        "created_at": now, "updated_at": now,
    })
    return {"id": session_id, "title": title, "created_at": now, "updated_at": now}


def list_chat_sessions(user_id: str, limit: int = 50) -> list[dict]:
    try:
        conn = get_connection()
        rows = conn.execute(
            "SELECT * FROM chat_sessions WHERE user_id=? ORDER BY updated_at DESC LIMIT ?",
            (user_id, limit),
        ).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            first_msg = conn.execute(
                "SELECT content FROM chat_messages WHERE session_id=? AND role='user' ORDER BY created_at ASC LIMIT 1",
                (d["id"],),
            ).fetchone()
            d["preview"] = (first_msg["content"][:80] if first_msg else "") if first_msg else ""
            msg_count = conn.execute(
                "SELECT COUNT(*) as cnt FROM chat_messages WHERE session_id=?", (d["id"],)
            ).fetchone()
            d["message_count"] = msg_count["cnt"] if isinstance(msg_count, dict) else msg_count[0]
            result.append(d)
        conn.close()
        return result
    except Exception as exc:
        logger.error("list_chat_sessions error: %s", exc)
        return []


def delete_chat_session(user_id: str, session_id: str) -> bool:
    try:
        conn = get_connection()
        conn.execute("DELETE FROM chat_messages WHERE session_id=? AND user_id=?", (session_id, user_id))
        conn.execute("DELETE FROM chat_sessions WHERE id=? AND user_id=?", (session_id, user_id))
        conn.commit()
        conn.close()
        return True
    except Exception as exc:
        logger.error("delete_chat_session error: %s", exc)
        return False


def update_chat_session_title(user_id: str, session_id: str, title: str) -> bool:
    try:
        conn = get_connection()
        conn.execute(
            "UPDATE chat_sessions SET title=? WHERE id=? AND user_id=?",
            (title, session_id, user_id),
        )
        conn.commit()
        conn.close()
        return True
    except Exception as exc:
        logger.error("update_chat_session_title error: %s", exc)
        return False


# ── Ensure directories exist ──────────────────────────────────────────────────
INSPO_DIR: str = os.getenv("INSPO_DIR", "inspo")
os.makedirs(INSPO_DIR, exist_ok=True)


# ── Link page helpers ─────────────────────────────────────────────────────────

def get_or_create_link_page(user_id: str) -> dict:
    try:
        conn = get_connection()
        row = conn.execute(
            "SELECT * FROM link_pages WHERE user_id = ? LIMIT 1", (user_id,)
        ).fetchone()
        conn.close()
        if row:
            return dict(row)
    except Exception as exc:
        logger.error("get_or_create_link_page lookup: %s", exc)

    token = uuid.uuid4().hex[:16]
    now = datetime.now(timezone.utc).isoformat()
    record = {
        "id": str(uuid.uuid4()), "user_id": user_id, "share_token": token,
        "page_title": "", "bio": "", "is_public": 0, "theme": "dark",
        "created_at": now, "updated_at": now,
    }
    insert_row("link_pages", record)
    return record


def get_link_page_by_token(token: str) -> dict | None:
    try:
        conn = get_connection()
        row = conn.execute(
            "SELECT lp.*, u.display_name, u.email "
            "FROM link_pages lp JOIN users u ON lp.user_id = u.id "
            "WHERE lp.share_token = ? AND lp.is_public = 1 LIMIT 1",
            (token,),
        ).fetchone()
        conn.close()
        return dict(row) if row else None
    except Exception as exc:
        logger.error("get_link_page_by_token: %s", exc)
        return None


# ── User memory helpers ────────────────────────────────────────────────────────

def save_user_memory(user_id: str, fact: str, category: str = "general") -> bool:
    return insert_row("user_memory", {
        "id": str(uuid.uuid4()), "user_id": user_id, "fact": fact.strip(),
        "category": category, "source": "conversation",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


def get_user_memories(user_id: str, limit: int = 50) -> list[dict]:
    try:
        conn = get_connection()
        rows = conn.execute(
            "SELECT * FROM user_memory WHERE user_id=? ORDER BY created_at DESC LIMIT ?",
            (user_id, limit),
        ).fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as exc:
        logger.error("get_user_memories error: %s", exc)
        return []


# ── Balance account helpers ────────────────────────────────────────────────

def get_or_create_balance_account(user_id: str) -> dict:
    try:
        conn = get_connection()
        row = conn.execute(
            "SELECT * FROM accounts WHERE user_id=? AND name='Balance' LIMIT 1",
            (user_id,),
        ).fetchone()
        conn.close()
        if row:
            return dict(row)
    except Exception as exc:
        logger.error("get_or_create_balance_account lookup: %s", exc)

    account = {
        "id": str(uuid.uuid4()), "user_id": user_id, "name": "Balance",
        "type": "checking", "institution": "", "balance": 0.0,
        "currency": "USD", "last_updated": datetime.now(timezone.utc).isoformat(),
        "metadata": "",
    }
    insert_row("accounts", account)
    return account


def get_balance(user_id: str) -> float:
    acct = get_or_create_balance_account(user_id)
    return float(acct.get("balance", 0))


def update_balance(user_id: str, new_balance: float) -> bool:
    acct = get_or_create_balance_account(user_id)
    return update_row(
        "accounts",
        {"balance": new_balance, "last_updated": datetime.now(timezone.utc).isoformat()},
        {"id": acct["id"]},
    )


def adjust_balance(user_id: str, delta: float) -> float:
    acct = get_or_create_balance_account(user_id)
    new_bal = float(acct["balance"]) + delta
    update_row(
        "accounts",
        {"balance": new_bal, "last_updated": datetime.now(timezone.utc).isoformat()},
        {"id": acct["id"]},
    )
    return new_bal


# ── Recurring income helpers ───────────────────────────────────────────────

def get_recurring_income(user_id: str) -> list[dict]:
    try:
        conn = get_connection()
        rows = conn.execute(
            "SELECT * FROM recurring_income WHERE user_id=? AND is_active=1 ORDER BY amount DESC",
            (user_id,),
        ).fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as exc:
        logger.error("get_recurring_income error: %s", exc)
        return []


def get_total_monthly_income(user_id: str) -> float:
    sources = get_recurring_income(user_id)
    total = 0.0
    for s in sources:
        amt = float(s["amount"])
        freq = (s.get("frequency") or "monthly").lower()
        if freq == "weekly":
            total += amt * 4.33
        elif freq == "biweekly":
            total += amt * 2.167
        elif freq == "yearly":
            total += amt / 12
        else:
            total += amt
    return total


# ── Net worth snapshot helpers ────────────────────────────────────────────

def snapshot_net_worth(user_id: str) -> bool:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    try:
        conn = get_connection()
        existing = conn.execute(
            "SELECT id FROM net_worth_snapshots WHERE user_id=? AND snapshot_date=?",
            (user_id, today),
        ).fetchone()
        if existing:
            conn.close()
            return False

        assets = conn.execute(
            "SELECT SUM(balance) as total FROM accounts WHERE user_id=? AND balance>0",
            (user_id,),
        ).fetchone()
        liabs = conn.execute(
            "SELECT ABS(SUM(balance)) as total FROM accounts WHERE user_id=? AND balance<0",
            (user_id,),
        ).fetchone()
        conn.close()

        total_assets = float(assets["total"] or 0) if assets else 0
        total_liabs = float(liabs["total"] or 0) if liabs else 0
        nw = total_assets - total_liabs

        return insert_row("net_worth_snapshots", {
            "id": str(uuid.uuid4()), "user_id": user_id,
            "total_assets": total_assets, "total_liabilities": total_liabs,
            "net_worth": nw, "snapshot_date": today,
        })
    except Exception as exc:
        logger.error("snapshot_net_worth error: %s", exc)
        return False


def get_nw_history(user_id: str, limit: int = 90) -> list[dict]:
    try:
        conn = get_connection()
        rows = conn.execute(
            "SELECT * FROM net_worth_snapshots WHERE user_id=? ORDER BY snapshot_date DESC LIMIT ?",
            (user_id, limit),
        ).fetchall()
        conn.close()
        return [dict(r) for r in reversed(rows)]
    except Exception as exc:
        logger.error("get_nw_history error: %s", exc)
        return []


# ── API spend tracking ────────────────────────────────────────────────────────

_COST_PER_INPUT_TOKEN  = 0.30 / 1_000_000
_COST_PER_OUTPUT_TOKEN = 0.50 / 1_000_000


def record_token_spend(user_id: str, prompt_tokens: int, completion_tokens: int) -> None:
    cost = prompt_tokens * _COST_PER_INPUT_TOKEN + completion_tokens * _COST_PER_OUTPUT_TOKEN
    now   = datetime.now(timezone.utc).isoformat()
    month = datetime.now(timezone.utc).strftime("%Y-%m")
    try:
        conn = get_connection()
        if _USE_PG:
            conn.execute(
                "INSERT INTO user_api_spend (id, user_id, month, prompt_tokens, completion_tokens, cost_usd, updated_at) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s) "
                "ON CONFLICT(user_id, month) DO UPDATE SET "
                "  prompt_tokens = user_api_spend.prompt_tokens + EXCLUDED.prompt_tokens, "
                "  completion_tokens = user_api_spend.completion_tokens + EXCLUDED.completion_tokens, "
                "  cost_usd = user_api_spend.cost_usd + EXCLUDED.cost_usd, "
                "  updated_at = EXCLUDED.updated_at",
                (str(uuid.uuid4()), user_id, month, prompt_tokens, completion_tokens, cost, now),
            )
        else:
            conn.execute(
                "INSERT INTO user_api_spend (id, user_id, month, prompt_tokens, completion_tokens, cost_usd, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(user_id, month) DO UPDATE SET "
                "  prompt_tokens = prompt_tokens + excluded.prompt_tokens, "
                "  completion_tokens = completion_tokens + excluded.completion_tokens, "
                "  cost_usd = cost_usd + excluded.cost_usd, "
                "  updated_at = excluded.updated_at",
                (str(uuid.uuid4()), user_id, month, prompt_tokens, completion_tokens, cost, now),
            )
        conn.commit()
        conn.close()
    except Exception as exc:
        logger.error("record_token_spend error: %s", exc)


def get_monthly_spend(user_id: str) -> float:
    return get_monthly_token_usage(user_id)["cost_usd"]


def get_monthly_token_usage(user_id: str, month: str | None = None) -> dict:
    """Return prompt/completion token totals and estimated cost for the month."""
    if month is None:
        month = datetime.now(timezone.utc).strftime("%Y-%m")
    empty = {
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "total_tokens": 0,
        "cost_usd": 0.0,
        "month": month,
    }
    try:
        conn = get_connection()
        row = conn.execute(
            "SELECT prompt_tokens, completion_tokens, cost_usd FROM user_api_spend "
            "WHERE user_id=? AND month=?",
            (user_id, month),
        ).fetchone()
        conn.close()
        if not row:
            return empty
        prompt = int(row["prompt_tokens"] or 0)
        completion = int(row["completion_tokens"] or 0)
        return {
            "prompt_tokens": prompt,
            "completion_tokens": completion,
            "total_tokens": prompt + completion,
            "cost_usd": float(row["cost_usd"] or 0),
            "month": month,
        }
    except Exception as exc:
        logger.error("get_monthly_token_usage error: %s", exc)
        return empty


# ── Voice minute usage helpers ────────────────────────────────────────────────

def get_voice_seconds_used(user_id: str, month: str | None = None) -> float:
    """Return total voice seconds consumed by *user_id* in *month* (YYYY-MM)."""
    if month is None:
        month = datetime.now(timezone.utc).strftime("%Y-%m")
    try:
        conn = get_connection()
        row = conn.execute(
            "SELECT seconds_used FROM voice_minute_usage WHERE user_id=? AND month=?",
            (user_id, month),
        ).fetchone()
        conn.close()
        return float(row["seconds_used"]) if row else 0.0
    except Exception as exc:
        logger.error("get_voice_seconds_used error: %s", exc)
        return 0.0


def record_voice_seconds(user_id: str, seconds: float) -> None:
    """Atomically add *seconds* to the current month's voice usage bucket."""
    if seconds <= 0:
        return
    month = datetime.now(timezone.utc).strftime("%Y-%m")
    now = datetime.now(timezone.utc).isoformat()
    try:
        conn = get_connection()
        if _USE_PG:
            conn.execute(
                "INSERT INTO voice_minute_usage (id, user_id, month, seconds_used, updated_at) "
                "VALUES (%s, %s, %s, %s, %s) "
                "ON CONFLICT(user_id, month) DO UPDATE SET "
                "  seconds_used = voice_minute_usage.seconds_used + EXCLUDED.seconds_used, "
                "  updated_at = EXCLUDED.updated_at",
                (str(uuid.uuid4()), user_id, month, seconds, now),
            )
        else:
            conn.execute(
                "INSERT INTO voice_minute_usage (id, user_id, month, seconds_used, updated_at) "
                "VALUES (?, ?, ?, ?, ?) "
                "ON CONFLICT(user_id, month) DO UPDATE SET "
                "  seconds_used = seconds_used + excluded.seconds_used, "
                "  updated_at = excluded.updated_at",
                (str(uuid.uuid4()), user_id, month, seconds, now),
            )
        conn.commit()
        conn.close()
    except Exception as exc:
        logger.error("record_voice_seconds error: %s", exc)


def get_voice_topup_minutes(user_id: str, month: str | None = None) -> int:
    """Return total bonus minutes purchased via top-ups this calendar month."""
    if month is None:
        month = datetime.now(timezone.utc).strftime("%Y-%m")
    month_start = f"{month}-01"
    # End of month: first day of next month
    y, m = int(month[:4]), int(month[5:7])
    if m == 12:
        month_end = f"{y + 1}-01-01"
    else:
        month_end = f"{y}-{m + 1:02d}-01"
    try:
        conn = get_connection()
        row = conn.execute(
            "SELECT COALESCE(SUM(minutes_added), 0) as total "
            "FROM voice_topups WHERE user_id=? AND created_at>=? AND created_at<?",
            (user_id, month_start, month_end),
        ).fetchone()
        conn.close()
        return int(row["total"]) if row else 0
    except Exception as exc:
        logger.error("get_voice_topup_minutes error: %s", exc)
        return 0


def add_voice_topup(
    user_id: str,
    minutes_added: int,
    price_usd: float,
    stripe_payment_intent: str = "",
) -> bool:
    """Record a voice-minute top-up purchase."""
    return insert_row("voice_topups", {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "minutes_added": minutes_added,
        "price_usd": price_usd,
        "stripe_payment_intent": stripe_payment_intent,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


# ── User preferences ──────────────────────────────────────────────────────────

def get_user_preferences(user_id: str) -> dict:
    try:
        conn = get_connection()
        row = conn.execute("SELECT * FROM user_preferences WHERE user_id=?", (user_id,)).fetchone()
        conn.close()
        if row:
            return dict(row)
        return {
            "user_id": user_id,
            "last_reset_anchor": None,
            "voice_overlay_enabled": 0,
            "golden_mode_enabled": 0,
            "briefing_time": "07:00",
            "briefing_includes": "finance,health,calendar,goals",
            "onboarding_complete": 0,
        }
    except Exception as exc:
        logger.error("get_user_preferences error: %s", exc)
        return {"user_id": user_id}


def upsert_user_preferences(user_id: str, updates: dict) -> bool:
    try:
        conn = get_connection()
        existing = conn.execute("SELECT user_id FROM user_preferences WHERE user_id=?", (user_id,)).fetchone()
        if existing:
            sets = ", ".join(f"{k}=?" for k in updates)
            conn.execute(f"UPDATE user_preferences SET {sets} WHERE user_id=?", (*updates.values(), user_id))
        else:
            row = {"user_id": user_id, **updates}
            cols = ", ".join(row.keys())
            placeholders = ", ".join("?" for _ in row)
            conn.execute(f"INSERT INTO user_preferences ({cols}) VALUES ({placeholders})", tuple(row.values()))
        conn.commit()
        conn.close()
        return True
    except Exception as exc:
        logger.error("upsert_user_preferences error: %s", exc)
        return False


# ── Chat message quota ────────────────────────────────────────────────────────

def get_chat_message_count(user_id: str, month: str | None = None) -> int:
    if month is None:
        month = datetime.now(timezone.utc).strftime("%Y-%m")
    try:
        conn = get_connection()
        row = conn.execute(
            "SELECT count FROM chat_message_counts WHERE user_id=? AND month=?",
            (user_id, month),
        ).fetchone()
        conn.close()
        return int(row["count"]) if row else 0
    except Exception as exc:
        logger.error("get_chat_message_count error: %s", exc)
        return 0


def increment_chat_message_count(user_id: str) -> int:
    """Increment and return the new count for this month."""
    month = datetime.now(timezone.utc).strftime("%Y-%m")
    try:
        conn = get_connection()
        if _USE_PG:
            row = conn.execute(
                "INSERT INTO chat_message_counts (id, user_id, month, count) VALUES (%s, %s, %s, 1) "
                "ON CONFLICT(user_id, month) DO UPDATE SET count = chat_message_counts.count + 1 "
                "RETURNING count",
                (str(uuid.uuid4()), user_id, month),
            ).fetchone()
        else:
            conn.execute(
                "INSERT INTO chat_message_counts (id, user_id, month, count) VALUES (?, ?, ?, 1) "
                "ON CONFLICT(user_id, month) DO UPDATE SET count = count + 1",
                (str(uuid.uuid4()), user_id, month),
            )
            row = conn.execute(
                "SELECT count FROM chat_message_counts WHERE user_id=? AND month=?",
                (user_id, month),
            ).fetchone()
        conn.commit()
        conn.close()
        return int(row["count"]) if row else 1
    except Exception as exc:
        logger.error("increment_chat_message_count error: %s", exc)
        return 0


# ── Health vitals ─────────────────────────────────────────────────────────────

def add_health_vital(user_id: str, vital_type: str, value: float, unit: str = "",
                     note: str = "", recorded_at: str = "", source: str = "manual") -> dict:
    now = datetime.now(timezone.utc).isoformat()
    row = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": vital_type,
        "value": value,
        "unit": unit,
        "note": note,
        "source": source,
        "recorded_at": recorded_at or now,
        "created_at": now,
    }
    insert_row("health_vitals", row)
    return row


def get_health_vitals(user_id: str, vital_type: str | None = None,
                      limit: int = 50) -> list[dict]:
    try:
        conn = get_connection()
        if vital_type:
            rows = conn.execute(
                "SELECT * FROM health_vitals WHERE user_id=? AND type=? ORDER BY recorded_at DESC LIMIT ?",
                (user_id, vital_type, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM health_vitals WHERE user_id=? ORDER BY recorded_at DESC LIMIT ?",
                (user_id, limit),
            ).fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as exc:
        logger.error("get_health_vitals error: %s", exc)
        return []


def delete_health_vital(user_id: str, vital_id: str) -> bool:
    try:
        conn = get_connection()
        conn.execute("DELETE FROM health_vitals WHERE id=? AND user_id=?", (vital_id, user_id))
        conn.commit()
        conn.close()
        return True
    except Exception as exc:
        logger.error("delete_health_vital error: %s", exc)
        return False


# ── Medications ───────────────────────────────────────────────────────────────

def add_medication(user_id: str, name: str, dose: str = "", frequency: str = "daily",
                   next_dose_at: str = "", notes: str = "") -> dict:
    now = datetime.now(timezone.utc).isoformat()
    row = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "name": name,
        "dose": dose,
        "frequency": frequency,
        "next_dose_at": next_dose_at,
        "notes": notes,
        "active": 1,
        "created_at": now,
    }
    insert_row("medications", row)
    return row


def get_medications(user_id: str, active_only: bool = True) -> list[dict]:
    try:
        conn = get_connection()
        q = "SELECT * FROM medications WHERE user_id=?"
        params: list = [user_id]
        if active_only:
            q += " AND active=1"
        q += " ORDER BY name"
        rows = conn.execute(q, params).fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as exc:
        logger.error("get_medications error: %s", exc)
        return []


def update_medication(user_id: str, med_id: str, updates: dict) -> bool:
    allowed = {"name", "dose", "frequency", "next_dose_at", "notes", "active"}
    filtered = {k: v for k, v in updates.items() if k in allowed}
    if not filtered:
        return False
    try:
        conn = get_connection()
        sets = ", ".join(f"{k}=?" for k in filtered)
        conn.execute(f"UPDATE medications SET {sets} WHERE id=? AND user_id=?",
                     (*filtered.values(), med_id, user_id))
        conn.commit()
        conn.close()
        return True
    except Exception as exc:
        logger.error("update_medication error: %s", exc)
        return False


def delete_medication(user_id: str, med_id: str) -> bool:
    try:
        conn = get_connection()
        conn.execute("UPDATE medications SET active=0 WHERE id=? AND user_id=?", (med_id, user_id))
        conn.commit()
        conn.close()
        return True
    except Exception as exc:
        logger.error("delete_medication error: %s", exc)
        return False


# ── Health appointments ───────────────────────────────────────────────────────

def add_health_appointment(user_id: str, appt_type: str = "", provider: str = "",
                            date: str = "", location: str = "", notes: str = "") -> dict:
    now = datetime.now(timezone.utc).isoformat()
    row = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": appt_type,
        "provider": provider,
        "date": date,
        "location": location,
        "notes": notes,
        "created_at": now,
    }
    insert_row("health_appointments", row)
    return row


def get_health_appointments(user_id: str, upcoming_only: bool = False) -> list[dict]:
    try:
        conn = get_connection()
        if upcoming_only:
            today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            rows = conn.execute(
                "SELECT * FROM health_appointments WHERE user_id=? AND date>=? ORDER BY date",
                (user_id, today),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM health_appointments WHERE user_id=? ORDER BY date DESC LIMIT 50",
                (user_id,),
            ).fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as exc:
        logger.error("get_health_appointments error: %s", exc)
        return []


def delete_health_appointment(user_id: str, appt_id: str) -> bool:
    try:
        conn = get_connection()
        conn.execute("DELETE FROM health_appointments WHERE id=? AND user_id=?", (appt_id, user_id))
        conn.commit()
        conn.close()
        return True
    except Exception as exc:
        logger.error("delete_health_appointment error: %s", exc)
        return False


# ── User places / location ────────────────────────────────────────────────────

def add_user_place(user_id: str, label: str, address: str = "",
                   lat: float = 0, lng: float = 0) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    row = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "label": label,
        "address": address,
        "lat": lat,
        "lng": lng,
        "created_at": now,
    }
    insert_row("user_places", row)
    return row


def get_user_places(user_id: str) -> list[dict]:
    try:
        conn = get_connection()
        rows = conn.execute(
            "SELECT * FROM user_places WHERE user_id=? ORDER BY label",
            (user_id,),
        ).fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as exc:
        logger.error("get_user_places error: %s", exc)
        return []


def delete_user_place(user_id: str, place_id: str) -> bool:
    try:
        conn = get_connection()
        conn.execute("DELETE FROM user_places WHERE id=? AND user_id=?", (place_id, user_id))
        conn.commit()
        conn.close()
        return True
    except Exception as exc:
        logger.error("delete_user_place error: %s", exc)
        return False


def upsert_commute_pattern(user_id: str, from_place: str, to_place: str,
                            days: str, depart_time: str) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    try:
        conn = get_connection()
        existing = conn.execute(
            "SELECT id FROM commute_patterns WHERE user_id=?", (user_id,)
        ).fetchone()
        if existing:
            conn.execute(
                "UPDATE commute_patterns SET from_place=?, to_place=?, days=?, depart_time=? WHERE user_id=?",
                (from_place, to_place, days, depart_time, user_id),
            )
            row = {"id": existing["id"], "user_id": user_id, "from_place": from_place,
                   "to_place": to_place, "days": days, "depart_time": depart_time}
        else:
            row_id = str(uuid.uuid4())
            conn.execute(
                "INSERT INTO commute_patterns (id, user_id, from_place, to_place, days, depart_time, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (row_id, user_id, from_place, to_place, days, depart_time, now),
            )
            row = {"id": row_id, "user_id": user_id, "from_place": from_place,
                   "to_place": to_place, "days": days, "depart_time": depart_time}
        conn.commit()
        conn.close()
        return row
    except Exception as exc:
        logger.error("upsert_commute_pattern error: %s", exc)
        return {}


def get_commute_pattern(user_id: str) -> dict | None:
    try:
        conn = get_connection()
        row = conn.execute("SELECT * FROM commute_patterns WHERE user_id=?", (user_id,)).fetchone()
        conn.close()
        return dict(row) if row else None
    except Exception as exc:
        logger.error("get_commute_pattern error: %s", exc)
        return None


# ── Briefings ─────────────────────────────────────────────────────────────────

def get_briefing(user_id: str, date: str) -> dict | None:
    try:
        conn = get_connection()
        row = conn.execute(
            "SELECT * FROM briefings WHERE user_id=? AND date=?", (user_id, date)
        ).fetchone()
        conn.close()
        return dict(row) if row else None
    except Exception as exc:
        logger.error("get_briefing error: %s", exc)
        return None


def save_briefing(user_id: str, date: str, content: dict) -> bool:
    now = datetime.now(timezone.utc).isoformat()
    try:
        conn = get_connection()
        if _USE_PG:
            conn.execute(
                "INSERT INTO briefings (id, user_id, date, content_json, delivered_at) "
                "VALUES (%s, %s, %s, %s, %s) ON CONFLICT(user_id, date) DO UPDATE SET "
                "content_json=EXCLUDED.content_json, delivered_at=EXCLUDED.delivered_at",
                (str(uuid.uuid4()), user_id, date, json.dumps(content), now),
            )
        else:
            conn.execute(
                "INSERT INTO briefings (id, user_id, date, content_json, delivered_at) "
                "VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, date) DO UPDATE SET "
                "content_json=excluded.content_json, delivered_at=excluded.delivered_at",
                (str(uuid.uuid4()), user_id, date, json.dumps(content), now),
            )
        conn.commit()
        conn.close()
        return True
    except Exception as exc:
        logger.error("save_briefing error: %s", exc)
        return False


def mark_briefing_read(user_id: str, date: str) -> bool:
    now = datetime.now(timezone.utc).isoformat()
    try:
        conn = get_connection()
        conn.execute(
            "UPDATE briefings SET read_at=? WHERE user_id=? AND date=?",
            (now, user_id, date),
        )
        conn.commit()
        conn.close()
        return True
    except Exception as exc:
        logger.error("mark_briefing_read error: %s", exc)
        return False


# ── Approval requests ─────────────────────────────────────────────────────────

def create_approval_request(user_id: str, action_type: str, description: str,
                             payload: dict, expires_hours: int = 48) -> dict:
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    expires = (now + timedelta(hours=expires_hours)).isoformat()
    row = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "action_type": action_type,
        "description": description,
        "payload_json": json.dumps(payload),
        "status": "pending",
        "created_at": now.isoformat(),
        "expires_at": expires,
        "resolved_at": "",
    }
    insert_row("approval_requests", row)
    return row


def get_approval_requests(user_id: str, status: str | None = "pending") -> list[dict]:
    try:
        conn = get_connection()
        if status:
            rows = conn.execute(
                "SELECT * FROM approval_requests WHERE user_id=? AND status=? ORDER BY created_at DESC",
                (user_id, status),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM approval_requests WHERE user_id=? ORDER BY created_at DESC LIMIT 50",
                (user_id,),
            ).fetchall()
        conn.close()
        result = []
        for r in rows:
            d = dict(r)
            try:
                d["payload"] = json.loads(d.get("payload_json") or "{}")
            except Exception:
                d["payload"] = {}
            result.append(d)
        return result
    except Exception as exc:
        logger.error("get_approval_requests error: %s", exc)
        return []


def resolve_approval_request(user_id: str, approval_id: str, status: str) -> bool:
    if status not in ("approved", "rejected"):
        return False
    now = datetime.now(timezone.utc).isoformat()
    try:
        conn = get_connection()
        conn.execute(
            "UPDATE approval_requests SET status=?, resolved_at=? WHERE id=? AND user_id=? AND status='pending'",
            (status, now, approval_id, user_id),
        )
        conn.commit()
        conn.close()
        return True
    except Exception as exc:
        logger.error("resolve_approval_request error: %s", exc)
        return False


# ── Memory helpers (extended) ─────────────────────────────────────────────────

def get_user_memory(user_id: str, category: str | None = None, limit: int = 100) -> list[dict]:
    try:
        conn = get_connection()
        if category:
            rows = conn.execute(
                "SELECT * FROM user_memory WHERE user_id=? AND category=? ORDER BY created_at DESC LIMIT ?",
                (user_id, category, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM user_memory WHERE user_id=? ORDER BY created_at DESC LIMIT ?",
                (user_id, limit),
            ).fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as exc:
        logger.error("get_user_memory error: %s", exc)
        return []


def delete_memory_fact(user_id: str, memory_id: str) -> bool:
    try:
        conn = get_connection()
        conn.execute("DELETE FROM user_memory WHERE id=? AND user_id=?", (memory_id, user_id))
        conn.commit()
        conn.close()
        return True
    except Exception as exc:
        logger.error("delete_memory_fact error: %s", exc)
        return False


def count_user_memory(user_id: str) -> int:
    try:
        conn = get_connection()
        row = conn.execute("SELECT COUNT(*) as c FROM user_memory WHERE user_id=?", (user_id,)).fetchone()
        conn.close()
        return int(row["c"]) if row else 0
    except Exception as exc:
        logger.error("count_user_memory error: %s", exc)
        return 0


# ── Auto-initialise (SQLite only — Postgres init is done in FastAPI lifespan) ─
if not _USE_PG:
    init_db()
