"""
backend/backup.py — compatibility shim.

Implementation lives in core/backup.py. Use `python -m backend.backup` or `python -m core.backup`.
"""

from core.backup import DEFAULT_BACKUP_DIR, backup_database, run_cli

__all__ = ["DEFAULT_BACKUP_DIR", "backup_database", "run_cli"]

if __name__ == "__main__":
    run_cli()
