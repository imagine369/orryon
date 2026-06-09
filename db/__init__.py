"""
db — Database connection, schema init, and generic CRUD.

Import domain helpers from submodules explicitly::

    from db.auth import get_or_create_user_by_email
    from db.chat import save_chat_message
    from db.finance import adjust_balance

The barrel re-exports only connection lifecycle and table CRUD helpers.
"""

from __future__ import annotations

from db.connection import (
    close_pool,
    decrypt_value,
    encrypt_value,
    get_connection,
    init_pool,
)
from db.crud import delete_row, fetch_rows, insert_row, update_row
from db.schema import init_db

import db.bootstrap  # noqa: F401 — SQLite auto-init in local dev

__all__ = [
    "close_pool",
    "decrypt_value",
    "delete_row",
    "encrypt_value",
    "fetch_rows",
    "get_connection",
    "init_db",
    "init_pool",
    "insert_row",
    "update_row",
]
