"""
db.crud — Generic insert/fetch/update/delete helpers.
"""
from __future__ import annotations

import logging

from db.connection import _USE_PG, get_connection

logger = logging.getLogger(__name__)

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
    "chat_message_counts", "user_api_spend",
    "fulfillment_handoffs", "fulfillment_url_cache",
})

# Tables with a user_id column — purged on DELETE /api/account (users row removed last).
_ACCOUNT_PURGE_EXCLUDED = frozenset({
    "users",
    "waitlist",
    "verification_codes",
    "contact_submissions",
})
USER_OWNED_TABLES: frozenset[str] = _ALLOWED_TABLES - _ACCOUNT_PURGE_EXCLUDED


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


def delete_user_account(user_id: str) -> None:
    """Permanently delete all rows owned by *user_id*, then the users row.

    All-or-nothing: any failure rolls back; the users row is not removed unless
    every purge step succeeds.
    """
    conn = get_connection()
    try:
        for table in sorted(USER_OWNED_TABLES):
            conn.execute(f"DELETE FROM {table} WHERE user_id=?", (user_id,))
        conn.execute(
            "DELETE FROM verification_codes WHERE email=(SELECT email FROM users WHERE id=?)",
            (user_id,),
        )
        conn.execute("DELETE FROM users WHERE id=?", (user_id,))
        conn.commit()
    except Exception:
        conn.rollback()
        logger.exception("delete_user_account failed for user %s — rolled back", user_id)
        raise
    finally:
        conn.close()

