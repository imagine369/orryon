"""SQLite export must not leak other users' rows inside finance.db."""
from __future__ import annotations

import io
import os
import sqlite3
import uuid
import zipfile

import pytest
from httpx import ASGITransport, AsyncClient

from backend.main import app
from db import insert_row
from db.auth import get_or_create_user_by_email
from tests.test_account_routes import _headers_for_email


@pytest.mark.skipif(bool(os.environ.get("DATABASE_URL")), reason="SQLite-only export DB test")
@pytest.mark.asyncio
async def test_export_sqlite_db_contains_only_requesting_user():
    user_a = get_or_create_user_by_email("export-privacy-a@orryon.test")
    user_b = get_or_create_user_by_email("export-privacy-b@orryon.test")

    tx_a = f"export-tx-a-{uuid.uuid4().hex[:8]}"
    tx_b = f"export-tx-b-{uuid.uuid4().hex[:8]}"
    insert_row("transactions", {
        "id": tx_a,
        "user_id": user_a["id"],
        "amount": 10.0,
        "description": "privacy-test-a",
        "date": "2026-06-01",
        "category": "Test",
        "account_id": "",
    })
    insert_row("transactions", {
        "id": tx_b,
        "user_id": user_b["id"],
        "amount": 20.0,
        "description": "privacy-test-b",
        "date": "2026-06-01",
        "category": "Test",
        "account_id": "",
    })

    headers = _headers_for_email(user_a["email"])
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/export", headers=headers)
    assert res.status_code == 200

    with zipfile.ZipFile(io.BytesIO(res.content)) as zf:
        assert "finance.db" in zf.namelist()
        assert "data.json" in zf.namelist()
        with zf.open("finance.db") as db_file:
            export_db = sqlite3.connect(":memory:")
            export_db.deserialize(db_file.read())
            try:
                user_ids = {
                    row[0]
                    for row in export_db.execute("SELECT id FROM users").fetchall()
                }
                assert user_ids == {user_a["id"]}

                tx_ids = {row[0] for row in export_db.execute("SELECT id FROM transactions").fetchall()}
                assert tx_a in tx_ids
                assert tx_b not in tx_ids
            finally:
                export_db.close()
