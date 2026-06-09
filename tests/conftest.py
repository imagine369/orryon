"""Pytest fixtures — isolated SQLite DB per session, or Postgres when DATABASE_URL is set."""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Must be set before db/config import — config.DB_PATH is read once at import time.
os.environ.setdefault("NODE_ENV", "development")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-for-pytest-only-32b")
os.environ.setdefault("REQUEST_SIGNING_MODE", "off")
os.environ.setdefault("ENABLE_DEMO", "1")
os.environ["REDIS_URL"] = ""

_USE_PG_CI = bool(os.environ.get("DATABASE_URL"))

if not _USE_PG_CI:
    os.environ.pop("DATABASE_URL", None)
    _TEST_DB = Path(tempfile.gettempdir()) / f"orryon_pytest_{os.getpid()}.db"
    if _TEST_DB.exists():
        _TEST_DB.unlink()
    os.environ["DB_PATH"] = str(_TEST_DB)
else:
    _TEST_DB = None


@pytest.fixture(scope="session", autouse=True)
def _test_db_path():
    if _USE_PG_CI:
        from db import init_db, init_pool

        init_pool()
        init_db()
        yield os.environ["DATABASE_URL"]
    else:
        from db import init_db

        init_db()
        yield str(_TEST_DB)
