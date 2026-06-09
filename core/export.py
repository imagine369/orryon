"""
core/export.py — User data export (ZIP bundle for account export).

Builds a ZIP file containing a user-scoped portable SQLite database and a
filtered JSON dump of only the requesting user's rows (SQLite or Postgres backend).
"""

from __future__ import annotations

import json
import os
import sqlite3
import tempfile
import zipfile

from db import get_connection


def _is_user_export_table(columns: list[str], table: str) -> bool:
    return "user_id" in columns or table == "users"


def _rows_to_dicts(rows: list) -> list[dict]:
    return [dict(r) for r in rows]


def _fetch_user_rows(conn, table: str, columns: list[str], user_id: str) -> list:
    if "user_id" in columns:
        return conn.execute(
            f'SELECT * FROM "{table}" WHERE user_id=?', (user_id,)
        ).fetchall()
    if table == "users":
        return conn.execute(
            f'SELECT * FROM "{table}" WHERE id=?', (user_id,)
        ).fetchall()
    return []


def _sqlite_table_names(conn) -> list[str]:
    return [
        r["name"]
        for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        ).fetchall()
    ]


def _sqlite_table_columns(conn, table: str) -> list[str]:
    return [r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()]


def _pg_table_names(conn) -> list[str]:
    return [
        r["table_name"]
        for r in conn.execute(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_type = 'BASE TABLE'
            ORDER BY table_name
            """
        ).fetchall()
    ]


def _pg_table_columns(conn, table: str) -> list[str]:
    return [
        r["column_name"]
        for r in conn.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = ?
            ORDER BY ordinal_position
            """,
            (table,),
        ).fetchall()
    ]


def _collect_user_export_data_sqlite(conn, user_id: str) -> dict[str, list[dict]]:
    export_data: dict[str, list[dict]] = {}
    for table in _sqlite_table_names(conn):
        columns = _sqlite_table_columns(conn, table)
        if not _is_user_export_table(columns, table):
            continue
        rows = _fetch_user_rows(conn, table, columns, user_id)
        if rows:
            export_data[table] = _rows_to_dicts(rows)
    return export_data


def _collect_user_export_data_postgres(conn, user_id: str) -> dict[str, list[dict]]:
    export_data: dict[str, list[dict]] = {}
    for table in _pg_table_names(conn):
        columns = _pg_table_columns(conn, table)
        if not _is_user_export_table(columns, table):
            continue
        rows = _fetch_user_rows(conn, table, columns, user_id)
        if rows:
            export_data[table] = _rows_to_dicts(rows)
    return export_data


def _write_user_scoped_sqlite_from_source(source_conn, user_id: str, dest_path: str) -> None:
    """
    Build a fresh SQLite file from a live SQLite source (schema + filtered rows).
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

            columns = _sqlite_table_columns(source_conn, table)
            if not _is_user_export_table(columns, table):
                continue

            dest.execute(create_row["sql"])
            rows = _fetch_user_rows(source_conn, table, columns, user_id)
            if not rows:
                continue

            col_list = ", ".join(columns)
            placeholders = ", ".join("?" for _ in columns)
            dest.executemany(
                f'INSERT INTO "{table}" ({col_list}) VALUES ({placeholders})',
                [tuple(row) for row in rows],
            )
        dest.commit()
    finally:
        dest.close()


def _write_sqlite_from_collected_data(export_data: dict[str, list[dict]], dest_path: str) -> None:
    """
    Build a portable SQLite file from collected row dicts (Postgres export path).

    Applies the canonical Orryon SQLite DDL, then inserts only the user's rows.
    """
    from db.schema import sqlite_ddl_script

    dest = sqlite3.connect(dest_path)
    try:
        dest.executescript(sqlite_ddl_script())
        for table, rows in export_data.items():
            if not rows:
                continue
            columns = list(rows[0].keys())
            col_list = ", ".join(columns)
            placeholders = ", ".join("?" for _ in columns)
            dest.executemany(
                f'INSERT INTO "{table}" ({col_list}) VALUES ({placeholders})',
                [tuple(row[c] for c in columns) for row in rows],
            )
        dest.commit()
    finally:
        dest.close()


def build_user_export_zip(user_id: str) -> bytes:
    """
    Build and return a ZIP archive (as bytes) containing:
      - finance.db  — user-scoped portable SQLite (never a full production DB copy)
      - data.json   — JSON export of only this user's rows

    Called by the FastAPI account export endpoint.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        db_copy = os.path.join(tmpdir, "finance.db")
        conn = get_connection()
        try:
            # Use the live connection dialect — not db.connection._USE_PG (imported
            # values go stale when startup falls back from Postgres to SQLite).
            if conn._is_pg:
                export_data = _collect_user_export_data_postgres(conn, user_id)
                _write_sqlite_from_collected_data(export_data, db_copy)
            else:
                export_data = _collect_user_export_data_sqlite(conn, user_id)
                _write_user_scoped_sqlite_from_source(conn, user_id, db_copy)
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
