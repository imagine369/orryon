"""
Agent context snapshot cache — shared across workers via Redis when available.

Falls back to an in-process dict when REDIS_URL is unset (single-worker dev).
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

logger = logging.getLogger(__name__)

_CONTEXT_TTL_FRESH = 300
_CONTEXT_TTL_STALE = 900
_CONTEXT_REDIS_TTL = 900

_local_cache: dict[str, tuple[float, str]] = {}
_refreshing: set[str] = set()


def _cache_key(user_id: str) -> str:
    return f"agent_ctx:{user_id}"


async def _redis_get(user_id: str) -> tuple[float, str] | None:
    try:
        from backend.cache import cache_get
        raw = await cache_get(_cache_key(user_id))
    except Exception:
        return None
    if not raw or not isinstance(raw, dict):
        return None
    ts = float(raw.get("ts", 0))
    text = raw.get("text")
    if not text:
        return None
    return ts, str(text)


async def _redis_set(user_id: str, text: str) -> None:
    try:
        from backend.cache import cache_set
        await cache_set(
            _cache_key(user_id),
            {"ts": time.time(), "text": text},
            ttl_seconds=_CONTEXT_REDIS_TTL,
        )
    except Exception as exc:
        logger.debug("Context Redis set failed: %s", exc)


async def get_context_snapshot_text(
    user_id: str,
    compute_fn,
) -> str:
    """
    Return cached context text or compute via compute_fn() (sync callable).

    compute_fn should return the snapshot string and may raise.
    """
    now = time.time()
    entry = _local_cache.get(user_id)
    if entry is None:
        entry = await _redis_get(user_id)
        if entry:
            _local_cache[user_id] = entry

    if entry:
        age = now - entry[0]
        if age < _CONTEXT_TTL_FRESH:
            return entry[1]
        if age < _CONTEXT_TTL_STALE:
            schedule_context_refresh(user_id, compute_fn)
            return entry[1]

    return await _compute_and_store(user_id, compute_fn)


async def _compute_and_store(user_id: str, compute_fn) -> str:
    text = await asyncio.to_thread(compute_fn)
    ts = time.time()
    _local_cache[user_id] = (ts, text)
    await _redis_set(user_id, text)
    return text


async def _refresh_worker(user_id: str, compute_fn) -> None:
    try:
        await _compute_and_store(user_id, compute_fn)
    except Exception as exc:
        logger.debug("Background context refresh failed: %s", exc)
    finally:
        _refreshing.discard(user_id)


def schedule_context_refresh(user_id: str, compute_fn) -> None:
    if user_id in _refreshing:
        return
    _refreshing.add(user_id)
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_refresh_worker(user_id, compute_fn))
    except RuntimeError:
        import threading

        def _run() -> None:
            try:
                asyncio.run(_refresh_worker(user_id, compute_fn))
            except Exception as exc:
                logger.debug("Background context refresh failed: %s", exc)
            finally:
                _refreshing.discard(user_id)

        threading.Thread(target=_run, daemon=True).start()


def invalidate_context_cache(user_id: str) -> None:
    """Drop cached snapshot after writes so the next turn sees fresh data."""
    _local_cache.pop(user_id, None)
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_redis_delete(user_id))
    except RuntimeError:
        pass


async def _redis_delete(user_id: str) -> None:
    try:
        from backend.cache import cache_delete
        await cache_delete(_cache_key(user_id))
    except Exception:
        pass
