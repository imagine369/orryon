"""
db.schema — Assembled DDL and init_db.

Per-domain table definitions live in ``schema_*.py`` modules. ``init_db()``
creates tables/indexes, then ``run_migrations()`` applies numbered SQL files.
"""
from __future__ import annotations

import logging
import sqlite3

from db import connection as db_connection
from db.connection import init_pool
from db.migrate import run_migrations
from db.schema.schema_approvals import TABLES as APPROVALS_TABLES
from db.schema.schema_auth import TABLES as AUTH_TABLES
from db.schema.schema_briefings import TABLES as BRIEFINGS_TABLES
from db.schema.schema_calendar import TABLES as CALENDAR_TABLES
from db.schema.schema_fulfillment import TABLES as FULFILLMENT_TABLES
from db.schema.schema_chat import TABLES as CHAT_TABLES
from db.schema.schema_finance import TABLES as FINANCE_TABLES
from db.schema.schema_habits import TABLES as HABITS_TABLES
from db.schema.schema_health import TABLES as HEALTH_TABLES
from db.schema.schema_indexes import INDEXES
from db.schema.schema_links import TABLES as LINKS_TABLES
from db.schema.schema_location import TABLES as LOCATION_TABLES
from db.schema.schema_organize import TABLES as ORGANIZE_TABLES
from db.schema.schema_preferences import TABLES as PREFERENCES_TABLES
from db.schema.schema_usage import TABLES as USAGE_TABLES

from config import DB_PATH

logger = logging.getLogger(__name__)

_ALL_TABLES = "\n\n".join(
    s.strip()
    for s in (
        AUTH_TABLES,
        CHAT_TABLES,
        FINANCE_TABLES,
        ORGANIZE_TABLES,
        LINKS_TABLES,
        HABITS_TABLES,
        PREFERENCES_TABLES,
        HEALTH_TABLES,
        LOCATION_TABLES,
        BRIEFINGS_TABLES,
        APPROVALS_TABLES,
        USAGE_TABLES,
        CALENDAR_TABLES,
        FULFILLMENT_TABLES,
    )
)


def sqlite_ddl_script() -> str:
    """SQLite CREATE TABLE script (same DDL ``init_db`` uses for SQLite)."""
    return _ALL_TABLES


def _exec_ddl_pg() -> None:
    pool = db_connection._pg_pool
    if pool is None:
        raise RuntimeError("Postgres pool not initialised — call init_pool() before init_db()")
    conn = pool.getconn()
    try:
        cur = conn.cursor()
        for stmt in _ALL_TABLES.split(";"):
            stmt = stmt.strip()
            if stmt:
                cur.execute(stmt)
        for stmt in INDEXES.strip().split(";"):
            stmt = stmt.strip()
            if stmt:
                cur.execute(stmt)
        conn.commit()
        logger.info("Postgres schema initialised")
    except Exception as exc:
        conn.rollback()
        logger.error("Postgres init_db failed: %s", exc)
        raise
    finally:
        pool.putconn(conn)


def _exec_ddl_sqlite() -> None:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    cur = conn.cursor()
    cur.executescript(_ALL_TABLES)
    cur.executescript(INDEXES)
    conn.commit()
    conn.close()
    logger.info("SQLite database initialised at: %s", DB_PATH)


def init_db() -> None:
    """Create all tables if they don't exist, then run numbered migrations."""
    if db_connection._USE_PG:
        if db_connection._pg_pool is None:
            init_pool()
        _exec_ddl_pg()
    else:
        _exec_ddl_sqlite()
    run_migrations()
