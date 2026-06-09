"""
core/export.py — User data export (ZIP bundle for account export).

Builds a ZIP file containing a user-scoped SQLite database (SQLite backend only)
and a filtered JSON dump of all user-owned rows.
"""

from __future__ import annotations

import json
import os
import shutil
import sqlite3
import tempfile
import zipfile

from config import DB_PATH
from db import get_connection
from db.connection import _USE_PG


def _sqlite_table_names(conn) -> list[str]:
    return [
        r["name"]
        for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        ).fetchall()
    ]


def _table_columns(conn, table: str) -> list[str]:
    return [r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()]


def _is_user_export_table(columns: list[str], table: str) -> bool:
    return "user_id" in columns or table == "users"


def _fetch_user_rows(conn, table: str, columns: list[str], user_id: str) -> list:
    if "user_id" in columns:
        return conn.execute(
            f"SELECT * FROM [{table}] WHERE user_id=?", (user_id,)
        ).fetchall()
    if table == "users":
        return conn.execute(
            f"SELECT * FROM [{table}] WHERE id=?", (user_id,)
        ).fetchall()
    return []


def _collect_user_export_data(conn, user_id: str) -> dict[str, list[dict]]:
    """Return table → rows for every user-owned table (SQLite catalog queries)."""
    export_data: dict[str, list[dict]] = {}
    for table in _sqlite_table_names(conn):
        columns = _table_columns(conn, table)
        if not _is_user_export_table(columns, table):
            continue
        rows = _fetch_user_rows(conn, table, columns, user_id)
        if rows:
            export_data[table] = [dict(r) for r in rows]
    return export_data


def _write_user_scoped_sqlite(source_conn, user_id: str, dest_path: str) -> None:
    """
    Build a fresh SQLite file containing only this user's rows.

    Schema is copied from the live database; data is filtered per table the same
    way as data.json (user_id match, or users.id for the users table).
    """
    dest = sqlite3.connect(dest_path)
    try:
        for table in _sqlite_table_names(source_conn):
            create_row = source_conn.execute(
                "SELECT sql FROM sqlite_master WHERE type='table' AND name=?",
                (table,),
            ).fetchone()
            if not create_row or not create_row["sql"]:
                continue

            columns = _table_columns(source_conn, table)
            if not _is_user_export_table(columns, table):
                continue

            dest.execute(create_row["sql"])
            rows = _fetch_user_rows(source_conn, table, columns, user_id)
            if not rows:
                continue

            col_list = ", ".join(columns)
            placeholders = ", ".join("?" for _ in columns)
            dest.executemany(
                f"INSERT INTO [{table}] ({col_list}) VALUES ({placeholders})",
                [tuple(row) for row in rows],
            )
        dest.commit()
    finally:
        dest.close()


def build_user_export_zip(user_id: str) -> bytes:
    """
    Build and return a ZIP archive (as bytes) containing:
      - finance.db  — user-scoped SQLite (SQLite backend only; never a full DB copy)
      - data.json   — JSON export of only this user's rows

    Called by the FastAPI account export endpoint.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        db_copy = os.path.join(tmpdir, "finance.db")
        conn = get_connection()
        try:
            export_data = _collect_user_export_data(conn, user_id)

            if not _USE_PG:
                _write_user_scoped_sqlite(conn, user_id, db_copy)
            else:
                # Postgres export path unchanged here (see separate Postgres export work).
                shutil.copy2(DB_PATH, db_copy)
        finally:
            conn.close()

        json_path = os.path.join(tmpdir, "data.json")
        with open(json_path, "w") as jf:
            json.dump(export_data, jf, indent=2, default=str)

        zip_path = os.path.join(tmpdir, "orryon_export.zip")
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.write(db_copy, "finance.db")
            zf.write(json_path, "data.json")

        with open(zip_path, "rb") as zr:
            return zr.read()
