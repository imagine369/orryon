"""
db.py — SQLite database setup and helpers for guddd.

All financial state is persisted locally in a single SQLite file (finance.db).
No cloud sync by default — privacy first.

Tables:
  users          - registered user accounts (multi-user auth)
  chat_messages  - persistent chat history per user
  accounts       - bank, investment, credit, loan, and manual asset accounts
  transactions   - income and expense line items
  holdings       - investment portfolio positions
  goals          - savings goals with progress tracking
  notes          - financial journal entries
  events         - calendar events and bill reminders
  subscriptions  - auto-detected or manually added recurring charges
  credit_scores  - credit score history snapshots

Usage:
  from db import insert_row, fetch_rows, update_row, get_connection
  from db import create_user, authenticate_user, save_chat_message, load_chat_history
"""

from __future__ import annotations

import hashlib
import os
import sqlite3
import logging
import uuid
from datetime import datetime
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
            username      TEXT UNIQUE NOT NULL,
            email         TEXT,
            display_name  TEXT,
            password_hash TEXT NOT NULL,
            salt          TEXT NOT NULL,
            created_at    TEXT NOT NULL
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
    """)

    conn.commit()
    conn.close()
    logger.info("Database initialised at: %s", DB_PATH)


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


# ── Password helpers ──────────────────────────────────────────────────────────

def _hash_password(password: str, salt: str) -> str:
    """PBKDF2-SHA256 hash with per-user salt. Built-in — no extra dependency."""
    dk = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        iterations=260_000,
    )
    return dk.hex()


# ── User auth ─────────────────────────────────────────────────────────────────

def create_user(
    username: str,
    password: str,
    display_name: str = "",
    email: str = "",
) -> dict | None:
    """
    Create a new user. Returns the user dict on success, None if username exists.
    """
    salt = os.urandom(32).hex()
    user = {
        "id": str(uuid.uuid4()),
        "username": username.strip().lower(),
        "email": email.strip().lower(),
        "display_name": display_name.strip() or username.strip(),
        "password_hash": _hash_password(password, salt),
        "salt": salt,
        "created_at": datetime.utcnow().isoformat(),
    }
    if insert_row("users", user):
        logger.info("Created user: %s (%s)", user["username"], user["id"])
        return user
    return None


def authenticate_user(username: str, password: str) -> dict | None:
    """
    Validate credentials. Returns the user dict on success, None on failure.
    Accepts username or email.
    """
    username = username.strip().lower()
    try:
        conn = get_connection()
        row = conn.execute(
            "SELECT * FROM users WHERE username = ? OR email = ? LIMIT 1",
            (username, username),
        ).fetchone()
        conn.close()
    except Exception as exc:
        logger.error("authenticate_user error: %s", exc)
        return None

    if not row:
        return None
    user = dict(row)
    expected = _hash_password(password, user["salt"])
    if not hashlib.compare_digest(expected, user["password_hash"]):
        return None
    return user


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


# Auto-initialise on import
init_db()
