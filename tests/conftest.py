"""Pytest fixtures — isolated SQLite DB per session."""
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
os.environ.pop("DATABASE_URL", None)

# Isolated DB for the whole pytest process. Set here (not in a fixture) so test
# modules can safely `from backend.main import app` during collection.
_TEST_DB = Path(tempfile.gettempdir()) / f"orryon_pytest_{os.getpid()}.db"
if _TEST_DB.exists():
    _TEST_DB.unlink()
os.environ["DB_PATH"] = str(_TEST_DB)


@pytest.fixture(scope="session", autouse=True)
def _test_db_path():
    from db import init_db

    init_db()
    yield str(_TEST_DB)
