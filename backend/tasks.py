"""
backend/tasks.py — Background task definitions for ARQ worker.

Non-critical work that shouldn't block the request cycle:
  - Memory extraction (LLM call after each chat turn)
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


# ── Task: extract memories from a chat exchange ──────────────────────────────

async def extract_memories(ctx: dict, user_message: str, assistant_response: str, user_id: str) -> None:
    """Ask Grok to extract personal facts from a chat exchange and store them."""
    try:
        from core.grok_agent import _call_grok, _parse_json_array
        from db import save_user_memory, get_user_memories

        existing = get_user_memories(user_id, limit=30)
        if len(existing) > 100:
            return

        result = _call_grok([
            {
                "role": "system",
                "content": (
                    "Extract notable personal facts from this conversation that would be useful "
                    "to remember for future interactions. Only extract CONCRETE facts like: "
                    "preferences, life circumstances, financial details, names of people/pets, "
                    "habits, or goals. Return a JSON array of strings. If nothing notable, return []. "
                    "Max 3 facts per exchange. Be concise (under 15 words each)."
                ),
            },
            {
                "role": "user",
                "content": f"User said: {user_message}\nAssistant responded: {assistant_response[:500]}",
            },
        ])

        content = result["choices"][0]["message"]["content"].strip()
        facts = _parse_json_array(content)
        for fact in facts[:3]:
            if isinstance(fact, str) and len(fact.strip()) > 5:
                save_user_memory(user_id, fact.strip())
    except Exception as exc:
        logger.debug("Memory extraction task failed: %s", exc)


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
        from db import get_connection, snapshot_net_worth
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
        "extract_memories": extract_memories,
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
    functions = [extract_memories, send_otp_email, snapshot_all_net_worth]
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
