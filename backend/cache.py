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
    consume_ws_ticket_async,
    init_redis,
    store_ws_ticket_async,
)

__all__ = [
    "init_redis",
    "close_redis",
    "check_rate_limit_async",
    "cache_get",
    "cache_set",
    "cache_delete",
    "consume_nonce_async",
    "store_ws_ticket_async",
    "consume_ws_ticket_async",
]
