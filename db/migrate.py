"""
db.migrate — Numbered SQL migrations (Option A: raw SQL, no ORM).

Tracks applied versions in ``schema_migrations``. Migration files live in
``db/migrations/`` as ``NNN_description.{postgres,sqlite}.sql`` or a single
``.sql`` applied on both dialects when statements are compatible.
"""
from __future__ import annotations

import logging
import re
import sqlite3
from pathlib import Path

from db.connection import _USE_PG, get_connection

logger = logging.getLogger(__name__)

_MIGRATIONS_DIR = Path(__file__).resolve().parent / "migrations"


def _migration_files() -> list[Path]:
    dialect = "postgres" if _USE_PG else "sqlite"
    seen: dict[str, Path] = {}
    for path in sorted(_MIGRATIONS_DIR.glob("*.sql")):
        name = path.name
        if name.endswith(f".{dialect}.sql"):
            key = name[: -len(f".{dialect}.sql")]
            seen[key] = path
        elif "." not in name.replace("_", ".") or re.match(r"^\d{3}_[^.]+\.sql$", name):
            # Plain NNN_name.sql — dialect-neutral fallback
            key = name.removesuffix(".sql")
            seen.setdefault(key, path)
    return [seen[k] for k in sorted(seen)]


def _ensure_migrations_table(conn) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version     TEXT PRIMARY KEY,
            applied_at  TEXT NOT NULL
        )
        """
    )
    conn.commit()


def _applied_versions(conn) -> set[str]:
    try:
        rows = conn.execute("SELECT version FROM schema_migrations").fetchall()
    except Exception:
        return set()
    out: set[str] = set()
    for row in rows:
        out.add(row["version"] if isinstance(row, dict) else row[0])
    return out


def _record_migration(conn, version: str) -> None:
    from datetime import datetime, timezone

    conn.execute(
        "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
        (version, datetime.now(timezone.utc).isoformat()),
    )


def _run_statement(conn, stmt: str) -> None:
    try:
        conn.execute(stmt)
    except Exception as exc:
        msg = str(exc).lower()
        if not _USE_PG and isinstance(exc, sqlite3.OperationalError):
            if "duplicate column name" in msg:
                return
        if _USE_PG and "already exists" in msg:
            return
        raise


def _apply_file(conn, path: Path) -> None:
    sql = path.read_text(encoding="utf-8")
    for stmt in sql.split(";"):
        stmt = stmt.strip()
        if not stmt or stmt.startswith("--"):
            continue
        _run_statement(conn, stmt)


def run_migrations() -> None:
    """Apply pending numbered SQL migrations. Safe to call after init_db DDL."""
    if not _MIGRATIONS_DIR.is_dir():
        return

    conn = get_connection()
    try:
        _ensure_migrations_table(conn)
        applied = _applied_versions(conn)
        for path in _migration_files():
            version = path.stem
            # Strip dialect suffix for version key
            for suffix in (".postgres", ".sqlite"):
                if version.endswith(suffix):
                    version = version[: -len(suffix)]
                    break
            if version in applied:
                continue
            logger.info("Applying migration %s", path.name)
            _apply_file(conn, path)
            _record_migration(conn, version)
            conn.commit()
    finally:
        conn.close()
