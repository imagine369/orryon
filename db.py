"""
db.py — SQLite database setup and helpers for orryon.

All financial state is persisted locally in a single SQLite file (finance.db).
No cloud sync by default — privacy first.

Tables:
  users               - registered user accounts (email-based, no passwords)
  verification_codes  - one-time 6-digit codes for email OTP auth
  chat_messages       - persistent chat history per user
  accounts            - bank, investment, credit, loan, and manual asset accounts
  transactions        - income and expense line items
  holdings            - investment portfolio positions
  goals               - savings goals with progress tracking
  notes               - financial journal entries
  events              - calendar events and bill reminders
  subscriptions       - auto-detected or manually added recurring charges
  credit_scores       - credit score history snapshots
  action_items        - orryon's task/action-item tracker
  links               - user's saved links (Linktree-style)
  inspo_images        - user's inspiration image board
  link_pages          - public Linktree-style page settings and share tokens

Usage:
  from db import insert_row, fetch_rows, update_row, get_connection
  from db import get_or_create_user_by_email, create_verification_code, verify_code
  from db import save_chat_message, load_chat_history
"""

from __future__ import annotations

import hashlib
import os
import random
import sqlite3
import logging
import uuid
from datetime import datetime, timedelta, timezone
from config import DB_PATH

logger = logging.getLogger(__name__)


# ── Connection ────────────────────────────────────────────────────────────────

def get_connection() -> sqlite3.Connection:
    """Return a thread-local SQLite connection with Row factory enabled."""
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")   # better concurrency for Streamlit
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


# ── Schema ────────────────────────────────────────────────────────────────────

def init_db() -> None:
    """Create all tables if they don't exist. Safe to call multiple times."""
    conn = get_connection()
    cur = conn.cursor()

    cur.executescript("""
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

        CREATE TABLE IF NOT EXISTS chat_messages (
            id          TEXT PRIMARY KEY,
            user_id     TEXT NOT NULL,
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
            type          TEXT NOT NULL,   -- checking | savings | investment | credit | loan | asset
            institution   TEXT,
            balance       REAL DEFAULT 0,
            currency      TEXT DEFAULT 'USD',
            last_updated  TEXT,
            metadata      TEXT            -- JSON blob for extra fields
        );

        CREATE TABLE IF NOT EXISTS transactions (
            id           TEXT PRIMARY KEY,
            account_id   TEXT,
            user_id      TEXT NOT NULL,
            date         TEXT NOT NULL,
            amount       REAL NOT NULL,   -- positive = expense, negative = income
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
            asset_type   TEXT,           -- stock | etf | crypto | bond | mutual_fund
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
            tags            TEXT,        -- comma-separated
            linked_account  TEXT,
            linked_goal     TEXT,
            created_at      TEXT,
            updated_at      TEXT
        );

        CREATE TABLE IF NOT EXISTS events (
            id                    TEXT PRIMARY KEY,
            user_id               TEXT NOT NULL,
            title                 TEXT NOT NULL,
            description           TEXT,
            event_date            TEXT NOT NULL,
            event_type            TEXT,        -- bill_due | review | reminder | goal_deadline
            amount                REAL DEFAULT 0,
            account_id            TEXT,
            is_recurring          INTEGER DEFAULT 0,
            recurrence            TEXT,        -- monthly | weekly | yearly
            is_synced_to_google   INTEGER DEFAULT 0,
            reminder_minutes      INTEGER DEFAULT 30,  -- 0=none, 10, 30, 60, 360, 1440
            reminder_sent         INTEGER DEFAULT 0,
            created_at            TEXT
        );

        CREATE TABLE IF NOT EXISTS subscriptions (
            id           TEXT PRIMARY KEY,
            user_id      TEXT NOT NULL,
            name         TEXT NOT NULL,
            amount       REAL DEFAULT 0,
            frequency    TEXT DEFAULT 'monthly',
            next_due     TEXT,
            category     TEXT,
            account_id   TEXT,
            is_active    INTEGER DEFAULT 1,
            detected_at  TEXT
        );

        CREATE TABLE IF NOT EXISTS credit_scores (
            id       TEXT PRIMARY KEY,
            user_id  TEXT NOT NULL,
            score    INTEGER NOT NULL,
            provider TEXT,
            date     TEXT NOT NULL,
            factors  TEXT             -- JSON
        );

        CREATE TABLE IF NOT EXISTS action_items (
            id          TEXT PRIMARY KEY,
            user_id     TEXT NOT NULL,
            title       TEXT NOT NULL,
            description TEXT,
            priority    TEXT DEFAULT 'medium',  -- high | medium | low
            status      TEXT DEFAULT 'open',    -- open | in_progress | done | cancelled
            due_date    TEXT,
            category    TEXT,                   -- work | personal | finance | travel | health | other
            created_by  TEXT DEFAULT 'edward',  -- which agent created it
            created_at  TEXT NOT NULL,
            updated_at  TEXT
        );

        CREATE TABLE IF NOT EXISTS links (
            id          TEXT PRIMARY KEY,
            user_id     TEXT NOT NULL,
            title       TEXT NOT NULL,
            url         TEXT NOT NULL,
            description TEXT,
            tags        TEXT,           -- comma-separated
            favicon_url TEXT,           -- optional cached favicon
            created_at  TEXT NOT NULL,
            updated_at  TEXT
        );

        CREATE TABLE IF NOT EXISTS inspo_images (
            id          TEXT PRIMARY KEY,
            user_id     TEXT NOT NULL,
            title       TEXT,
            file_path   TEXT NOT NULL,  -- local path under inspo/
            description TEXT,
            tags        TEXT,           -- comma-separated
            created_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS link_pages (
            id           TEXT PRIMARY KEY,
            user_id      TEXT UNIQUE NOT NULL,
            share_token  TEXT UNIQUE NOT NULL,  -- random slug used in public URL
            page_title   TEXT DEFAULT '',       -- e.g. "Jane's Links"
            bio          TEXT DEFAULT '',       -- short bio shown on public page
            is_public    INTEGER DEFAULT 0,     -- 0 = private, 1 = publicly accessible
            theme        TEXT DEFAULT 'dark',   -- dark | light | gradient
            created_at   TEXT NOT NULL,
            updated_at   TEXT
        );

        CREATE TABLE IF NOT EXISTS budget_categories (
            id          TEXT PRIMARY KEY,
            user_id     TEXT NOT NULL,
            category    TEXT NOT NULL,
            planned     REAL DEFAULT 0,
            month       TEXT NOT NULL,           -- YYYY-MM
            created_at  TEXT,
            UNIQUE(user_id, category, month)
        );

        CREATE TABLE IF NOT EXISTS grocery_items (
            id               TEXT PRIMARY KEY,
            user_id          TEXT NOT NULL,
            name             TEXT NOT NULL,
            quantity         TEXT DEFAULT '1',
            estimated_price  REAL DEFAULT 0,
            is_checked       INTEGER DEFAULT 0,
            added_at         TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS custom_categories (
            id          TEXT PRIMARY KEY,
            user_id     TEXT NOT NULL,
            name        TEXT NOT NULL,
            color       TEXT DEFAULT '#6366f1',
            icon        TEXT DEFAULT '🏷️',
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
    """)

    conn.commit()

    # ── Migrations ────────────────────────────────────────────────────────────
    _migrate_users_table(conn)
    _migrate_goals_table(conn)
    _migrate_subscriptions_table(conn)
    _migrate_events_reminders(conn)
    _migrate_users_notifications(conn)
    _migrate_user_memory(conn)
    _migrate_budget_rollover(conn)
    _migrate_transactions_currency(conn)
    _migrate_users_weekly_report(conn)
    _migrate_notes_rich(conn)
    _migrate_users_preferences(conn)
    _migrate_users_plan(conn)

    conn.close()
    logger.info("Database initialised at: %s", DB_PATH)


def _migrate_subscriptions_table(conn: sqlite3.Connection) -> None:
    """Add previous_amount + last_changed columns to subscriptions (v1 migration)."""
    try:
        cols = [r[1] for r in conn.execute("PRAGMA table_info(subscriptions)").fetchall()]
        if "previous_amount" not in cols:
            conn.execute("ALTER TABLE subscriptions ADD COLUMN previous_amount REAL DEFAULT 0")
        if "last_changed" not in cols:
            conn.execute("ALTER TABLE subscriptions ADD COLUMN last_changed TEXT DEFAULT ''")
        conn.commit()
    except Exception as exc:
        logger.warning("_migrate_subscriptions_table: %s (non-fatal)", exc)


def _migrate_goals_table(conn: sqlite3.Connection) -> None:
    """Add linked_budget_category column to goals table if it doesn't exist (v1 migration)."""
    try:
        cols = [r[1] for r in conn.execute("PRAGMA table_info(goals)").fetchall()]
        if "linked_budget_category" not in cols:
            conn.execute("ALTER TABLE goals ADD COLUMN linked_budget_category TEXT DEFAULT ''")
            conn.commit()
    except Exception as exc:
        logger.warning("_migrate_goals_table: %s (non-fatal)", exc)


def _migrate_events_reminders(conn: sqlite3.Connection) -> None:
    """Add reminder_minutes + reminder_sent columns to events table."""
    try:
        cols = [r[1] for r in conn.execute("PRAGMA table_info(events)").fetchall()]
        if "reminder_minutes" not in cols:
            conn.execute("ALTER TABLE events ADD COLUMN reminder_minutes INTEGER DEFAULT 30")
        if "reminder_sent" not in cols:
            conn.execute("ALTER TABLE events ADD COLUMN reminder_sent INTEGER DEFAULT 0")
        conn.commit()
    except Exception as exc:
        logger.warning("_migrate_events_reminders: %s (non-fatal)", exc)


def _migrate_users_notifications(conn: sqlite3.Connection) -> None:
    """Add notification preference columns to users table."""
    try:
        cols = [r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()]
        if "default_reminder_minutes" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN default_reminder_minutes INTEGER DEFAULT 30")
        if "daily_digest_enabled" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN daily_digest_enabled INTEGER DEFAULT 1")
        if "daily_digest_time" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN daily_digest_time TEXT DEFAULT '08:00'")
        if "last_digest_sent" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN last_digest_sent TEXT DEFAULT ''")
        conn.commit()
    except Exception as exc:
        logger.warning("_migrate_users_notifications: %s (non-fatal)", exc)


def _migrate_budget_rollover(conn: sqlite3.Connection) -> None:
    """Add rollover column to budget_categories."""
    try:
        cols = [r[1] for r in conn.execute("PRAGMA table_info(budget_categories)").fetchall()]
        if "rollover" not in cols:
            conn.execute("ALTER TABLE budget_categories ADD COLUMN rollover INTEGER DEFAULT 0")
            conn.commit()
    except Exception as exc:
        logger.warning("_migrate_budget_rollover: %s (non-fatal)", exc)


def _migrate_transactions_currency(conn: sqlite3.Connection) -> None:
    """Add currency and attachment_path columns to transactions."""
    try:
        cols = [r[1] for r in conn.execute("PRAGMA table_info(transactions)").fetchall()]
        if "currency" not in cols:
            conn.execute("ALTER TABLE transactions ADD COLUMN currency TEXT DEFAULT 'USD'")
        if "attachment_path" not in cols:
            conn.execute("ALTER TABLE transactions ADD COLUMN attachment_path TEXT DEFAULT ''")
        conn.commit()
    except Exception as exc:
        logger.warning("_migrate_transactions_currency: %s (non-fatal)", exc)


def _migrate_users_weekly_report(conn: sqlite3.Connection) -> None:
    """Add weekly_report_enabled column to users."""
    try:
        cols = [r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()]
        if "weekly_report_enabled" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN weekly_report_enabled INTEGER DEFAULT 1")
        if "last_weekly_report" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN last_weekly_report TEXT DEFAULT ''")
        conn.commit()
    except Exception as exc:
        logger.warning("_migrate_users_weekly_report: %s (non-fatal)", exc)


def _migrate_notes_rich(conn: sqlite3.Connection) -> None:
    """Add is_pinned and mood columns to notes table."""
    try:
        cols = [r[1] for r in conn.execute("PRAGMA table_info(notes)").fetchall()]
        if "is_pinned" not in cols:
            conn.execute("ALTER TABLE notes ADD COLUMN is_pinned INTEGER DEFAULT 0")
        if "mood" not in cols:
            conn.execute("ALTER TABLE notes ADD COLUMN mood TEXT DEFAULT ''")
        conn.commit()
    except Exception as exc:
        logger.warning("_migrate_notes_rich: %s (non-fatal)", exc)


def _migrate_users_preferences(conn: sqlite3.Connection) -> None:
    """Add user preference columns: currency, budget_cycle_start, spending_alert_pct, bill_due_alert_days."""
    try:
        cols = [r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()]
        if "currency" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN currency TEXT DEFAULT 'USD'")
        if "budget_cycle_start" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN budget_cycle_start INTEGER DEFAULT 1")
        if "spending_alert_pct" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN spending_alert_pct INTEGER DEFAULT 80")
        if "bill_due_alert_days" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN bill_due_alert_days INTEGER DEFAULT 3")
        conn.commit()
    except Exception as exc:
        logger.warning("_migrate_users_preferences: %s (non-fatal)", exc)


def _migrate_users_plan(conn: sqlite3.Connection) -> None:
    """Add billing plan columns to users (plan, trial_ends_at, stripe_customer_id, stripe_subscription_id)."""
    try:
        cols = [r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()]
        if "plan" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'free'")
        if "trial_ends_at" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN trial_ends_at TEXT DEFAULT ''")
        if "stripe_customer_id" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN stripe_customer_id TEXT DEFAULT ''")
        if "stripe_subscription_id" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN stripe_subscription_id TEXT DEFAULT ''")
        conn.commit()
    except Exception as exc:
        logger.warning("_migrate_users_plan: %s (non-fatal)", exc)


def _migrate_user_memory(conn: sqlite3.Connection) -> None:
    """Ensure user_memory table exists (added in v2)."""
    try:
        conn.execute("SELECT 1 FROM user_memory LIMIT 1")
    except sqlite3.OperationalError:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS user_memory (
                id          TEXT PRIMARY KEY,
                user_id     TEXT NOT NULL,
                fact        TEXT NOT NULL,
                category    TEXT DEFAULT 'general',
                source      TEXT DEFAULT 'conversation',
                created_at  TEXT NOT NULL,
                UNIQUE(user_id, fact)
            )
        """)
        conn.commit()


def _migrate_users_table(conn: sqlite3.Connection) -> None:
    """
    One-time migration: if the old `users` table still has password_hash / salt
    columns (legacy username+password auth), replace it with the lean email-only
    schema required by OTP auth.

    Existing rows are migrated by email where available; rows with no email are
    dropped (they cannot be recovered via OTP anyway).
    """
    try:
        cur = conn.cursor()
        cols = {
            row[1]
            for row in cur.execute("PRAGMA table_info(users)").fetchall()
        }
        if "password_hash" not in cols and "salt" not in cols:
            return  # already migrated

        logger.info("Migrating users table: removing legacy password columns…")
        cur.executescript("""
            CREATE TABLE IF NOT EXISTS users_otp_new (
                id            TEXT PRIMARY KEY,
                email         TEXT UNIQUE NOT NULL,
                display_name  TEXT,
                created_at    TEXT NOT NULL
            );

            INSERT OR IGNORE INTO users_otp_new (id, email, display_name, created_at)
            SELECT id, email, display_name, created_at
            FROM users
            WHERE email IS NOT NULL AND email != '';

            DROP TABLE users;

            ALTER TABLE users_otp_new RENAME TO users;
        """)
        conn.commit()
        logger.info("users table migration complete.")
    except Exception as exc:
        logger.error("_migrate_users_table error: %s", exc)


# ── Generic CRUD helpers ──────────────────────────────────────────────────────

def insert_row(table: str, data: dict) -> bool:
    """Insert or replace a row into *table* using *data* dict."""
    try:
        cols = ", ".join(data.keys())
        placeholders = ", ".join("?" for _ in data)
        conn = get_connection()
        conn.execute(
            f"INSERT OR REPLACE INTO {table} ({cols}) VALUES ({placeholders})",
            list(data.values()),
        )
        conn.commit()
        conn.close()
        return True
    except Exception as exc:
        logger.error("insert_row(%s) error: %s", table, exc)
        return False


def fetch_rows(table: str, where: dict | None = None, limit: int = 500) -> list[dict]:
    """
    Fetch rows from *table* with optional equality filters.

    Example:
        fetch_rows("transactions", {"user_id": "default_user"}, limit=100)
    """
    try:
        conn = get_connection()
        query = f"SELECT * FROM {table}"
        params: list = []
        if where:
            conditions = " AND ".join(f"{k} = ?" for k in where)
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
        set_clause = ", ".join(f"{k} = ?" for k in data)
        where_clause = " AND ".join(f"{k} = ?" for k in where)
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
        where_clause = " AND ".join(f"{k} = ?" for k in where)
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
    """SHA-256 hash of the plaintext OTP code for safe storage."""
    return hashlib.sha256(code.encode()).hexdigest()


# ── User auth (email OTP — no passwords stored) ───────────────────────────────

def get_or_create_user_by_email(email: str, display_name: str = "") -> dict:
    """
    Return the existing user for *email*, or create a new one.
    Email is the sole identifier — no username or password.
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

    # New user — start on a 14-day Pro trial
    from config import TRIAL_DAYS
    name = display_name.strip() or email.split("@")[0]
    trial_ends_at = (datetime.now(timezone.utc) + timedelta(days=TRIAL_DAYS)).isoformat()
    user = {
        "id": str(uuid.uuid4()),
        "email": email,
        "display_name": name,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "plan": "trial",
        "trial_ends_at": trial_ends_at,
    }
    insert_row("users", user)
    logger.info("Created user: %s (%s) — trial until %s", email, user["id"], trial_ends_at)
    return user


def create_verification_code(email: str) -> str:
    """
    Generate a cryptographically random 6-digit OTP for *email*.
    Stores the SHA-256 hash (not plaintext) with a 10-minute expiry.
    Returns the plaintext code to be emailed to the user.
    """
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
    logger.info("Verification code created for: %s (expires %s)", email, expires_at)
    return code


def verify_code(email: str, code: str) -> bool:
    """
    Check that *code* is valid for *email*: correct hash, not expired, not used.
    Marks the code as used on success (single-use).
    Returns True on success, False on any failure.
    """
    email = email.strip().lower()
    code_hash = _hash_code(code.strip())
    now = datetime.now(timezone.utc).isoformat()
    try:
        conn = get_connection()
        row = conn.execute(
            """
            SELECT id FROM verification_codes
            WHERE email = ? AND code_hash = ? AND used = 0 AND expires_at > ?
            ORDER BY created_at DESC LIMIT 1
            """,
            (email, code_hash, now),
        ).fetchone()
        if not row:
            conn.close()
            return False
        conn.execute(
            "UPDATE verification_codes SET used = 1 WHERE id = ?", (row["id"],)
        )
        conn.commit()
        conn.close()
        return True
    except Exception as exc:
        logger.error("verify_code error: %s", exc)
        return False


# ── Chat persistence ──────────────────────────────────────────────────────────

def save_chat_message(user_id: str, msg: dict) -> bool:
    """Persist a single chat message (user or assistant) for *user_id*."""
    row = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "role": msg.get("role", "user"),
        "content": msg.get("content", ""),
        "agent": msg.get("agent", ""),
        "status": msg.get("status", ""),
        "summary": msg.get("summary", ""),
        "confidence": msg.get("confidence", 0),
        "evidence": msg.get("evidence", ""),
        "next_steps": msg.get("next_steps_or_question", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    return insert_row("chat_messages", row)


def load_chat_history(user_id: str, limit: int = 100) -> list[dict]:
    """
    Load the most recent *limit* messages for *user_id*, oldest-first so they
    render in correct chronological order.
    """
    try:
        conn = get_connection()
        rows = conn.execute(
            """
            SELECT * FROM (
                SELECT * FROM chat_messages
                WHERE user_id = ?
                ORDER BY created_at DESC
                LIMIT ?
            ) ORDER BY created_at ASC
            """,
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


# ── Ensure directories exist ──────────────────────────────────────────────────
INSPO_DIR: str = os.getenv("INSPO_DIR", "inspo")
os.makedirs(INSPO_DIR, exist_ok=True)


# ── Link page helpers ─────────────────────────────────────────────────────────

def get_or_create_link_page(user_id: str) -> dict:
    """
    Return the link page record for *user_id*, creating one with a fresh
    share_token if it doesn't exist yet.
    """
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
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "share_token": token,
        "page_title": "",
        "bio": "",
        "is_public": 0,
        "theme": "dark",
        "created_at": now,
        "updated_at": now,
    }
    insert_row("link_pages", record)
    return record


def get_link_page_by_token(token: str) -> dict | None:
    """Look up a link page by its public share_token. Returns None if not found."""
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
    """Store a learned fact about the user. Duplicates are silently ignored."""
    return insert_row("user_memory", {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "fact": fact.strip(),
        "category": category,
        "source": "conversation",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


def get_user_memories(user_id: str, limit: int = 50) -> list[dict]:
    """Retrieve stored facts/preferences for a user, newest first."""
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
    """Return the single balance account for a user, creating it if needed."""
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
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "name": "Balance",
        "type": "checking",
        "institution": "",
        "balance": 0.0,
        "currency": "USD",
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "metadata": "",
    }
    insert_row("accounts", account)
    return account


def get_balance(user_id: str) -> float:
    """Return the user's current balance."""
    acct = get_or_create_balance_account(user_id)
    return float(acct.get("balance", 0))


def update_balance(user_id: str, new_balance: float) -> bool:
    """Set the user's balance to an exact amount."""
    acct = get_or_create_balance_account(user_id)
    return update_row(
        "accounts",
        {"balance": new_balance, "last_updated": datetime.now(timezone.utc).isoformat()},
        {"id": acct["id"]},
    )


def adjust_balance(user_id: str, delta: float) -> float:
    """Add (positive) or subtract (negative) from the balance. Returns the new balance."""
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
    """Get all active recurring income sources for a user."""
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
    """Sum all active recurring income, normalised to monthly."""
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
    """Take a daily net worth snapshot. No-ops if already taken today."""
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
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "total_assets": total_assets,
            "total_liabilities": total_liabs,
            "net_worth": nw,
            "snapshot_date": today,
        })
    except Exception as exc:
        logger.error("snapshot_net_worth error: %s", exc)
        return False


def get_nw_history(user_id: str, limit: int = 90) -> list[dict]:
    """Retrieve net worth snapshots for sparkline, oldest-first."""
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


# Auto-initialise on import
init_db()
