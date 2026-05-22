"""
db.connection — Connections, pool, encryption, and _DbConn wrapper.
"""
from __future__ import annotations

import logging
import sqlite3

from config import DB_PATH, DATABASE_URL, ENCRYPTION_KEY

logger = logging.getLogger(__name__)

# ── At-rest encryption (Fernet) ───────────────────────────────────────────────
# Encrypts sensitive financial fields (balances, amounts) stored in the DB.
# Enabled when ENCRYPTION_KEY is set. Transparent passthrough otherwise.

_fernet = None
if ENCRYPTION_KEY:
    try:
        from cryptography.fernet import Fernet
        _fernet = Fernet(ENCRYPTION_KEY.encode() if isinstance(ENCRYPTION_KEY, str) else ENCRYPTION_KEY)
        logger.info("At-rest encryption enabled (Fernet)")
    except Exception as exc:
        logger.error("ENCRYPTION_KEY is set but invalid — encryption disabled: %s", exc)


def encrypt_value(value: str) -> str:
    """Encrypt a string value for storage. Returns plaintext if no key configured."""
    if _fernet is None:
        return value
    return _fernet.encrypt(value.encode("utf-8")).decode("utf-8")


def decrypt_value(value: str) -> str:
    """Decrypt a stored value. Returns as-is if not encrypted or no key configured."""
    if _fernet is None:
        return value
    try:
        return _fernet.decrypt(value.encode("utf-8")).decode("utf-8")
    except Exception:
        return value  # not encrypted (legacy data) — passthrough

# ── Backend detection ──────────────────────────────────────────────────────────

_USE_PG = bool(DATABASE_URL)
_pg_pool = None  # Initialised by init_pool() at app startup


def init_pool() -> None:
    """Create the Postgres connection pool. Called from FastAPI lifespan."""
    global _pg_pool
    if not _USE_PG:
        return
    from psycopg_pool import ConnectionPool
    from psycopg.rows import dict_row
    _pg_pool = ConnectionPool(
        conninfo=DATABASE_URL,
        min_size=1,
        max_size=10,
        timeout=10,
        kwargs={
            "row_factory": dict_row,
            "autocommit": False,
            "connect_timeout": 10,
        },
    )
    try:
        _pg_pool.wait(timeout=20)
    except Exception as exc:
        logger.error("Postgres pool failed to connect within 20s: %s", exc)
        raise
    logger.info("Postgres connection pool ready (min=1, max=10)")


def close_pool() -> None:
    """Shut down the Postgres pool. Called from FastAPI lifespan."""
    global _pg_pool
    if _pg_pool:
        _pg_pool.close()
        _pg_pool = None


# ── Connection wrapper ─────────────────────────────────────────────────────────

class _PgCursor:
    """Wraps a psycopg cursor, converting ? to %s and normalising results."""
    __slots__ = ("_cur",)

    def __init__(self, cur):
        self._cur = cur

    def execute(self, sql: str, params=None):
        sql = sql.replace("?", "%s")
        self._cur.execute(sql, params or ())
        return self

    def executescript(self, sql: str):
        for stmt in sql.strip().split(";"):
            stmt = stmt.strip()
            if stmt:
                self._cur.execute(stmt)
        return self

    def fetchone(self):
        return self._cur.fetchone()

    def fetchall(self):
        return self._cur.fetchall()

    def __iter__(self):
        return iter(self._cur)


class _DbConn:
    """
    Unified connection wrapper. Converts ? to %s for Postgres, returns pooled
    connections on close(), and makes rows behave like dicts for both backends.
    """
    __slots__ = ("_conn", "_is_pg")

    def __init__(self, conn, is_pg: bool):
        self._conn = conn
        self._is_pg = is_pg

    def execute(self, sql: str, params=None):
        if self._is_pg:
            sql = sql.replace("?", "%s")
            result = self._conn.execute(sql, params or ())
            return _PgCursor(result)
        return self._conn.execute(sql, params or ())

    def cursor(self):
        if self._is_pg:
            return _PgCursor(self._conn.cursor())
        return self._conn.cursor()

    def commit(self):
        self._conn.commit()

    def close(self):
        if self._is_pg and _pg_pool:
            _pg_pool.putconn(self._conn)
        else:
            self._conn.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()


def get_connection() -> _DbConn:
    """Return a database connection (Postgres pool or SQLite)."""
    if _USE_PG and _pg_pool:
        conn = _pg_pool.getconn()
        return _DbConn(conn, is_pg=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return _DbConn(conn, is_pg=False)


