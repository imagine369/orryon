"""
core/export.py — User data export (shared between FastAPI and Streamlit).

Builds a ZIP file containing a copy of the SQLite database and a
filtered JSON dump of all user-owned rows.
"""

from __future__ import annotations

import json
import os
import shutil
import tempfile
import zipfile

from config import DB_PATH
from db import get_connection


def build_user_export_zip(user_id: str) -> bytes:
    """
    Build and return a ZIP archive (as bytes) containing:
      - finance.db  — full copy of the SQLite database
      - data.json   — JSON export of only this user's rows

    Both the FastAPI export endpoint and the Streamlit settings panel
    call this function to ensure consistent export behavior.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        db_copy = os.path.join(tmpdir, "finance.db")
        shutil.copy2(DB_PATH, db_copy)

        conn = get_connection()
        tables = [
            r["name"]
            for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        ]
        export_data: dict[str, list[dict]] = {}
        for tbl in tables:
            cols = [r[1] for r in conn.execute(f"PRAGMA table_info({tbl})").fetchall()]
            if "user_id" in cols:
                rows = conn.execute(f"SELECT * FROM {tbl} WHERE user_id=?", (user_id,)).fetchall()
            elif tbl == "users":
                rows = conn.execute(f"SELECT * FROM {tbl} WHERE id=?", (user_id,)).fetchall()
            else:
                continue
            export_data[tbl] = [dict(r) for r in rows]
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
