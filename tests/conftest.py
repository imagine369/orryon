"""Pytest fixtures — isolated SQLite DB per session."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Must be set before db import
os.environ.setdefault("NODE_ENV", "development")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-for-pytest-only-32b")
os.environ.setdefault("REQUEST_SIGNING_MODE", "off")
os.environ.setdefault("ENABLE_DEMO", "1")
# Avoid slow/blocked Redis connect during background startup in API tests.
os.environ["REDIS_URL"] = ""


@pytest.fixture(scope="session", autouse=True)
def _test_db_path(tmp_path_factory):
    db_file = tmp_path_factory.mktemp("orryon_pytest") / "test.db"
    os.environ["DB_PATH"] = str(db_file)
    os.environ.pop("DATABASE_URL", None)
    from db import init_db

    init_db()
    yield str(db_file)
