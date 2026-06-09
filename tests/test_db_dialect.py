"""Dialect coverage — Postgres path when DATABASE_URL is set (see CI backend-postgres job)."""
from __future__ import annotations

import io
import os
import sqlite3
import uuid
import zipfile

import pytest

from core.export import build_user_export_zip
from db import get_connection, init_db, insert_row
from db.auth import get_or_create_user_by_email


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


@pytest.mark.skipif(not os.environ.get("DATABASE_URL"), reason="Postgres CI only")
def test_postgres_export_excludes_other_users():
    """Postgres export must not leak other users' rows into finance.db."""
    init_db()
    user_a = get_or_create_user_by_email("pg-export-privacy-a@orryon.test")
    user_b = get_or_create_user_by_email("pg-export-privacy-b@orryon.test")

    tx_a = f"pg-export-tx-a-{uuid.uuid4().hex[:8]}"
    tx_b = f"pg-export-tx-b-{uuid.uuid4().hex[:8]}"
    insert_row("transactions", {
        "id": tx_a,
        "user_id": user_a["id"],
        "amount": 10.0,
        "description": "pg-privacy-test-a",
        "date": "2026-06-01",
        "category": "Test",
        "account_id": "",
    })
    insert_row("transactions", {
        "id": tx_b,
        "user_id": user_b["id"],
        "amount": 20.0,
        "description": "pg-privacy-test-b",
        "date": "2026-06-01",
        "category": "Test",
        "account_id": "",
    })

    zip_bytes = build_user_export_zip(user_a["id"])
    assert len(zip_bytes) > 100

    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        assert "finance.db" in zf.namelist()
        assert "data.json" in zf.namelist()
        export_db = sqlite3.connect(":memory:")
        export_db.deserialize(zf.read("finance.db"))
        try:
            user_ids = {row[0] for row in export_db.execute('SELECT id FROM "users"').fetchall()}
            assert user_ids == {user_a["id"]}

            tx_ids = {row[0] for row in export_db.execute('SELECT id FROM transactions').fetchall()}
            assert tx_a in tx_ids
            assert tx_b not in tx_ids
        finally:
            export_db.close()


def test_sqlite_migrations_applied():
    """Numbered migrations run after init_db on SQLite (default pytest path)."""
    if os.environ.get("DATABASE_URL"):
        pytest.skip("SQLite-only assertion")
    init_db()
    with get_connection() as conn:
        rows = conn.execute("SELECT version FROM schema_migrations ORDER BY version").fetchall()
    versions = [r["version"] if isinstance(r, dict) else r[0] for r in rows]
    assert "001_legacy_columns" in versions
