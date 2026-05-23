"""
core/backup.py — Automated SQLite database backup.

Creates timestamped copies of the SQLite database. Designed to run as a
cron job or Railway scheduled task.

Usage:
    python -m core.backup                  # local
    python -m backend.backup                 # compatibility shim
    python -m backend.backup --max-backups 7
"""

from __future__ import annotations

import argparse
import logging
import os
import shutil
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from config import DB_PATH

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(name)s  %(levelname)s  %(message)s")
logger = logging.getLogger(__name__)

DEFAULT_BACKUP_DIR = os.getenv("BACKUP_DIR", "/data/backups" if os.path.isdir("/data") else "backups")


def backup_database(backup_dir: str = DEFAULT_BACKUP_DIR, max_backups: int = 14) -> str | None:
    """
    Create a safe backup of the SQLite database using the VACUUM INTO command
    (produces a consistent snapshot even while the app is running).

    Returns the path to the backup file, or None on failure.
    """
    db_path = Path(DB_PATH)
    if not db_path.exists():
        logger.error("Database file not found: %s", DB_PATH)
        return None

    backup_path = Path(backup_dir)
    backup_path.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    dest = backup_path / f"finance_{timestamp}.db"

    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute("VACUUM INTO ?", (str(dest),))
        conn.close()

        size_mb = dest.stat().st_size / (1024 * 1024)
        logger.info("Backup created: %s (%.2f MB)", dest, size_mb)
    except Exception as exc:
        logger.error("Backup failed: %s — falling back to file copy", exc)
        try:
            shutil.copy2(DB_PATH, dest)
            logger.info("Fallback copy created: %s", dest)
        except Exception as copy_exc:
            logger.error("Fallback copy also failed: %s", copy_exc)
            return None

    _prune_old_backups(backup_path, max_backups)
    return str(dest)


def _prune_old_backups(backup_dir: Path, max_backups: int) -> None:
    """Remove oldest backups when the count exceeds max_backups."""
    backups = sorted(backup_dir.glob("finance_*.db"), key=lambda p: p.name)
    to_remove = backups[: max(0, len(backups) - max_backups)]
    for old in to_remove:
        old.unlink()
        logger.info("Pruned old backup: %s", old.name)


def run_cli() -> None:
    parser = argparse.ArgumentParser(description="Back up the orryon SQLite database")
    parser.add_argument("--max-backups", type=int, default=14, help="Max backups to retain (default: 14)")
    parser.add_argument("--backup-dir", type=str, default=DEFAULT_BACKUP_DIR, help="Directory to store backups")
    args = parser.parse_args()
    result = backup_database(backup_dir=args.backup_dir, max_backups=args.max_backups)
    if result:
        print(f"OK: {result}")
    else:
        print("FAILED")
        raise SystemExit(1)


if __name__ == "__main__":
    run_cli()
