"""
core/cache.py — Redis (Upstash) caching + rate limiting layer.

When REDIS_URL is set, uses Redis for cross-worker rate limiting and TTL caching.
Falls back to in-memory dicts when Redis is unavailable (single-worker dev mode).
"""

from __future__ import annotations

import json
import logging
import time
from collections import defaultdict
from typing import Any

from config import REDIS_URL

logger = logging.getLogger(__name__)

_redis = None
_USE_REDIS = bool(REDIS_URL)


async def init_redis() -> None:
    """Connect to Redis. Called from FastAPI lifespan."""
    global _redis, _USE_REDIS
    if not REDIS_URL:
        logger.info("REDIS_URL not set — using in-memory cache (single-worker only)")
        return
    try:
        import redis.asyncio as aioredis
        _redis = aioredis.from_url(
            REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=5,
        )
        await _redis.ping()
        _USE_REDIS = True
        logger.info("Redis connected (%s)", REDIS_URL.split("@")[-1][:30])
    except Exception as exc:
        logger.warning("Redis unavailable, falling back to in-memory: %s", exc)
        _redis = None
        _USE_REDIS = False


async def close_redis() -> None:
    global _redis
    if _redis:
        await _redis.aclose()
        _redis = None


# ── Rate limiting ─────────────────────────────────────────────────────────────
# Uses Redis sorted sets for sliding window rate limiting (works across workers).
# Falls back to in-memory buckets when Redis is unavailable.

_mem_buckets: dict[str, list[float]] = defaultdict(list)


async def check_rate_limit_async(key: str, limit: int, window_seconds: int = 60) -> bool:
    """
    Returns True if the request is ALLOWED, False if rate-limited.
    Increments the counter as a side effect.
    """
    if _USE_REDIS and _redis:
        return await _check_rate_limit_redis(key, limit, window_seconds)
    return _check_rate_limit_mem(key, limit, window_seconds)


async def _check_rate_limit_redis(key: str, limit: int, window: int) -> bool:
    rkey = f"rl:{key}"
    now = time.time()
    pipe = _redis.pipeline()
    pipe.zremrangebyscore(rkey, 0, now - window)
    pipe.zcard(rkey)
    pipe.zadd(rkey, {str(now): now})
    pipe.expire(rkey, window + 1)
    results = await pipe.execute()
    current_count = results[1]
    return current_count < limit


def _check_rate_limit_mem(key: str, limit: int, window: int) -> bool:
    now = time.time()
    bucket = _mem_buckets[key]
    _mem_buckets[key] = [t for t in bucket if now - t < window]
    if len(_mem_buckets[key]) >= limit:
        return False
    _mem_buckets[key].append(now)
    return True


# ── TTL cache ─────────────────────────────────────────────────────────────────
# Simple get/set with TTL, works across workers via Redis.

_mem_cache: dict[str, tuple[float, Any]] = {}


async def cache_get(key: str) -> Any | None:
    """Get a value from cache. Returns None on miss."""
    if _USE_REDIS and _redis:
        val = await _redis.get(f"cache:{key}")
        return json.loads(val) if val else None
    cached = _mem_cache.get(key)
    if cached and time.time() < cached[0]:
        return cached[1]
    return None


async def cache_set(key: str, value: Any, ttl_seconds: int = 60) -> None:
    """Set a value in cache with TTL."""
    if _USE_REDIS and _redis:
        await _redis.set(f"cache:{key}", json.dumps(value), ex=ttl_seconds)
        return
    _mem_cache[key] = (time.time() + ttl_seconds, value)


async def cache_delete(key: str) -> None:
    """Remove a cache entry (Redis or in-memory)."""
    if _USE_REDIS and _redis:
        await _redis.delete(f"cache:{key}")
        return
    _mem_cache.pop(key, None)


# ── Nonce replay protection ───────────────────────────────────────────────────
# Used by backend/signing.py to reject replayed HMAC-signed requests. A nonce is
# "consumed" at most once within its TTL. Redis-backed when available so the
# guarantee holds across workers; in-memory (pruned opportunistically) otherwise.

_mem_nonces: dict[str, float] = {}


async def consume_nonce_async(nonce: str, ttl_seconds: int = 180) -> bool:
    """
    Atomically claim a nonce. Returns True on first use, False if the nonce has
    already been seen within its TTL window (= replay).
    """
    if not nonce:
        return False
    if _USE_REDIS and _redis:
        # SET NX EX is atomic: returns None if the key already exists.
        created = await _redis.set(f"nonce:{nonce}", "1", nx=True, ex=ttl_seconds)
        return bool(created)
    return _consume_nonce_mem(nonce, ttl_seconds)


def _consume_nonce_mem(nonce: str, ttl_seconds: int) -> bool:
    now = time.time()
    # Opportunistic prune so memory can't grow unbounded.
    if len(_mem_nonces) > 4096:
        for k, expires in list(_mem_nonces.items()):
            if expires < now:
                _mem_nonces.pop(k, None)
    expires = _mem_nonces.get(nonce)
    if expires and expires > now:
        return False
    _mem_nonces[nonce] = now + ttl_seconds
    return True


# ── WebSocket auth tickets ────────────────────────────────────────────────────
# Single-use, short-lived tickets for /ws/chat (see backend/auth.py). Redis when
# available so mint/consume works across workers; in-memory fallback for dev.

_mem_ws_tickets: dict[str, tuple[float, dict[str, str]]] = {}


def _prune_mem_ws_tickets(now: float) -> None:
    if len(_mem_ws_tickets) <= 4096:
        return
    for ticket, (expires, _) in list(_mem_ws_tickets.items()):
        if expires < now:
            _mem_ws_tickets.pop(ticket, None)


async def store_ws_ticket_async(
    ticket: str,
    user_id: str,
    email: str,
    ttl_seconds: int = 30,
) -> None:
    """Store a one-time WebSocket auth ticket."""
    payload = {"user_id": user_id, "email": email}
    if _USE_REDIS and _redis:
        await _redis.set(f"ws_ticket:{ticket}", json.dumps(payload), ex=ttl_seconds)
        return
    now = time.time()
    _prune_mem_ws_tickets(now)
    _mem_ws_tickets[ticket] = (now + ttl_seconds, payload)


async def consume_ws_ticket_async(ticket: str) -> dict[str, str] | None:
    """Atomically consume a ticket. Returns user payload or None if invalid/expired."""
    if not ticket:
        return None
    if _USE_REDIS and _redis:
        val = await _redis.getdel(f"ws_ticket:{ticket}")
        if not val:
            return None
        data = json.loads(val)
        if not isinstance(data, dict):
            return None
        user_id = data.get("user_id")
        email = data.get("email")
        if not user_id or not email:
            return None
        return {"user_id": user_id, "email": email}
    now = time.time()
    entry = _mem_ws_tickets.pop(ticket, None)
    if entry is None:
        return None
    expires, payload = entry
    if expires < now:
        return None
    return payload
