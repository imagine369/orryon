"""
db.bootstrap — SQLite auto-init on import (local dev).
"""
from __future__ import annotations

from db.connection import _USE_PG
from db.schema import init_db

if not _USE_PG:
    init_db()
