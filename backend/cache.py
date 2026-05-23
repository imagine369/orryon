"""
backend/cache.py — compatibility shim.

Implementation lives in core/cache.py so shared domain code does not import backend/.
"""

from core.cache import (
    cache_delete,
    cache_get,
    cache_set,
    check_rate_limit_async,
    close_redis,
    consume_nonce_async,
    init_redis,
)

__all__ = [
    "init_redis",
    "close_redis",
    "check_rate_limit_async",
    "cache_get",
    "cache_set",
    "cache_delete",
    "consume_nonce_async",
]
