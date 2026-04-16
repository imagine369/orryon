"""
backend/main.py — FastAPI application for orryon.

This is the assembly point: it creates the FastAPI app, applies middleware,
registers all routers, and starts the background scheduler. Route handlers
live in backend/routers/ — see each module for endpoint documentation.

Run from project root:
    uvicorn backend.main:app --reload --port 8000

The Next.js frontend (frontend/) connects to this server via the
NEXT_PUBLIC_API_URL environment variable (default: http://localhost:8000).
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routers import auth, chat, finance, organize, account, connections, waitlist, contact, calendar_sync
from config import XAI_API_KEY

# ── Sentry Setup ─────────────────────────────────────────────────────────────
_sentry_dsn = os.getenv("SENTRY_DSN", "")
if _sentry_dsn:
    sentry_sdk.init(
        dsn=_sentry_dsn,
        traces_sample_rate=0.2,
        profiles_sample_rate=0.1,
        environment=os.getenv("NODE_ENV", "development"),
        integrations=[
            StarletteIntegration(transaction_style="endpoint"),
            FastApiIntegration(transaction_style="endpoint"),
        ],
        send_default_pii=False,
    )
    print("Sentry initialized for backend")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(name)s  %(levelname)s  %(message)s",
)
logger = logging.getLogger(__name__)


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup:
      1. Postgres connection pool (if DATABASE_URL is set)
      2. Redis connection (if REDIS_URL is set)
      3. Database schema migration
      4. APScheduler background jobs

    Shutdown:
      1. Close httpx client
      2. Close Redis
      3. Close Postgres pool
      4. Stop scheduler
    """
    from db import init_pool, close_pool, init_db
    from backend.cache import init_redis, close_redis
    from core.grok_agent import close_http_client
    from core.scheduler import start_scheduler, stop_scheduler

    init_pool()
    await init_redis()
    init_db()
    start_scheduler()
    logger.info("orryon backend started (AI: %s)", "enabled" if XAI_API_KEY else "disabled")

    if XAI_API_KEY:
        try:
            from core.grok_agent import get_http_client
            client = get_http_client()
            await client.head("https://api.x.ai/v1/models", timeout=5.0)
            logger.info("xAI connection prewarmed")
        except Exception:
            pass

    yield

    await close_http_client()
    await close_redis()
    close_pool()
    stop_scheduler()


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="orryon",
    version="3.0",
    description="Intelligent personal finance concierge — REST + SSE API",
    lifespan=lifespan,
)

_is_prod = os.getenv("NODE_ENV", "").lower() == "production"
_cors_origins: list[str] = []
if not _is_prod:
    _cors_origins += ["http://localhost:3000", "http://127.0.0.1:3000"]
_frontend_url = os.getenv("FRONTEND_URL", "")
if _frontend_url:
    _cors_origins.append(_frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(finance.router)
app.include_router(organize.router)
app.include_router(account.router)
app.include_router(connections.router)
app.include_router(waitlist.router)
app.include_router(contact.router)
app.include_router(calendar_sync.router)


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/api/health", tags=["health"])
async def health():
    """Liveness probe for Railway / Render / Docker health checks."""
    from config import DATABASE_URL, REDIS_URL
    return {
        "status": "ok",
        "version": "3.0",
        "ai": bool(XAI_API_KEY),
        "postgres": bool(DATABASE_URL),
        "redis": bool(REDIS_URL),
    }
