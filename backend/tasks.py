"""
backend/tasks.py — Background task definitions for ARQ worker.

Non-critical work that shouldn't block the request cycle:
  - OTP email sending (SMTP I/O)
  - Daily digest emails
  - Net worth snapshots

Run the worker:
    arq backend.tasks.WorkerSettings

When REDIS_URL is not set, tasks fall back to running in-thread (dev mode).
"""

from __future__ import annotations

import logging
from typing import Any

from config import REDIS_URL

logger = logging.getLogger(__name__)


# Memory extraction runs in grok_agent._extract_memories_worker (per chat turn).
# No ARQ duplicate — avoids double-writes and drift from two code paths.

# ── Task: send OTP email ────────────────────────────────────────────────────

async def send_otp_email(ctx: dict, email: str, code: str) -> None:
    """Send a verification code email via SMTP."""
    try:
        from email_sender import send_verification_code
        send_verification_code(email, code)
    except Exception as exc:
        logger.error("OTP email task failed for %s: %s", email, exc)


# ── Task: daily net worth snapshot ───────────────────────────────────────────

async def snapshot_all_net_worth(ctx: dict) -> None:
    """Take net worth snapshots for all active users."""
    try:
        from db import get_connection
        from db.finance import snapshot_net_worth
        conn = get_connection()
        rows = conn.execute("SELECT id FROM users").fetchall()
        conn.close()
        for r in rows:
            snapshot_net_worth(r["id"])
    except Exception as exc:
        logger.error("Net worth snapshot task failed: %s", exc)


# ── Enqueue helper (used by app code) ────────────────────────────────────────

async def enqueue(func_name: str, *args: Any) -> bool:
    """
    Enqueue a background task. Uses ARQ when Redis is available,
    falls back to running the task inline (in a thread) when it's not.
    """
    if REDIS_URL:
        try:
            from arq import create_pool
            from arq.connections import RedisSettings
            pool = await create_pool(RedisSettings.from_dsn(REDIS_URL))
            await pool.enqueue_job(func_name, *args)
            await pool.aclose()
            return True
        except Exception as exc:
            logger.warning("ARQ enqueue failed, running inline: %s", exc)

    import asyncio
    task_map = {
        "send_otp_email": send_otp_email,
        "snapshot_all_net_worth": snapshot_all_net_worth,
    }
    fn = task_map.get(func_name)
    if fn:
        try:
            await fn({}, *args)
        except Exception:
            pass
    return False


# ── ARQ WorkerSettings ───────────────────────────────────────────────────────

class WorkerSettings:
    """ARQ worker configuration. Run with: arq backend.tasks.WorkerSettings"""
    functions = [send_otp_email, snapshot_all_net_worth]
    redis_settings = None

    @classmethod
    def get_redis_settings(cls):
        if REDIS_URL:
            from arq.connections import RedisSettings
            return RedisSettings.from_dsn(REDIS_URL)
        return None

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        cls.redis_settings = cls.get_redis_settings()
