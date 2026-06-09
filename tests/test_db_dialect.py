"""Dialect coverage — Postgres path when DATABASE_URL is set (see CI backend-postgres job)."""
from __future__ import annotations

import os

import pytest

from db import get_connection, init_db, insert_row


@pytest.mark.skipif(not os.environ.get("DATABASE_URL"), reason="Postgres CI only")
def test_postgres_init_and_roundtrip():
    """init_db + parameterized insert/select on Postgres."""
    init_db()
    uid = "dialect-smoke-user"
    with get_connection() as conn:
        conn.execute("DELETE FROM users WHERE id=?", (uid,))
        conn.commit()
    insert_row("users", {
        "id": uid,
        "email": "dialect@orryon.test",
        "display_name": "Dialect",
        "created_at": "2026-01-01T00:00:00+00:00",
    })
    with get_connection() as conn:
        row = conn.execute("SELECT email FROM users WHERE id=?", (uid,)).fetchone()
        conn.execute("DELETE FROM users WHERE id=?", (uid,))
        conn.commit()
    email = row["email"] if isinstance(row, dict) else row[0]
    assert email == "dialect@orryon.test"


def test_sqlite_migrations_applied():
    """Numbered migrations run after init_db on SQLite (default pytest path)."""
    if os.environ.get("DATABASE_URL"):
        pytest.skip("SQLite-only assertion")
    init_db()
    with get_connection() as conn:
        rows = conn.execute("SELECT version FROM schema_migrations ORDER BY version").fetchall()
    versions = [r["version"] if isinstance(r, dict) else r[0] for r in rows]
    assert "001_legacy_columns" in versions
