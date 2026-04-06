"""
db.py — SQLite database setup and helpers for guddd.

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
  action_items        - Edward's task/action-item tracker
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
from datetime import datetime, timedelta
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
            id             TEXT PRIMARY KEY,
            user_id        TEXT NOT NULL,
            name           TEXT NOT NULL,
            target_amount  REAL NOT NULL,
            current_amount REAL DEFAULT 0,
            target_date    TEXT,
            category       TEXT,         -- emergency | vacation | house | retirement | education | other
            notes          TEXT,
            created_at     TEXT,
            is_completed   INTEGER DEFAULT 0
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
    """)

    conn.commit()

    # ── Migration: drop legacy password columns from users if they exist ──
    # (upgrading from username/password auth to email OTP auth)
    _migrate_users_table(conn)

    conn.close()
    logger.info("Database initialised at: %s", DB_PATH)


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

    # New user
    name = display_name.strip() or email.split("@")[0]
    user = {
        "id": str(uuid.uuid4()),
        "email": email,
        "display_name": name,
        "created_at": datetime.utcnow().isoformat(),
    }
    insert_row("users", user)
    logger.info("Created user: %s (%s)", email, user["id"])
    return user


def create_verification_code(email: str) -> str:
    """
    Generate a cryptographically random 6-digit OTP for *email*.
    Stores the SHA-256 hash (not plaintext) with a 10-minute expiry.
    Returns the plaintext code to be emailed to the user.
    """
    email = email.strip().lower()
    code = f"{random.SystemRandom().randint(0, 999999):06d}"
    expires_at = (datetime.utcnow() + timedelta(minutes=10)).isoformat()
    insert_row("verification_codes", {
        "id": str(uuid.uuid4()),
        "email": email,
        "code_hash": _hash_code(code),
        "expires_at": expires_at,
        "used": 0,
        "created_at": datetime.utcnow().isoformat(),
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
    now = datetime.utcnow().isoformat()
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
        "created_at": datetime.utcnow().isoformat(),
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
    now = datetime.utcnow().isoformat()
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


# Auto-initialise on import
init_db()
