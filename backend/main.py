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

from backend.middleware import OriginEnforcementMiddleware, PerIpRateLimitMiddleware
from backend.routers import auth, chat, finance, organize, account, connections, contact, calendar_sync, voice, habits, admin, memory, health, location, briefings, approvals, waitlist
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

def _log_email_config_status() -> None:
    """Log a clear summary of email delivery config on boot.

    Without at least one of Resend or SMTP, the OTP sign-in flow cannot deliver
    codes to users — a silent misconfiguration that has bitten us in prod before.
    In production we log an ERROR so it's impossible to miss in Railway/Sentry;
    in dev we log INFO since on-screen code fallback still works.
    """
    from config import RESEND_ENABLED, SMTP_ENABLED, SMTP_HOST, SMTP_USER

    is_prod = os.getenv("NODE_ENV", "").lower() == "production"

    if RESEND_ENABLED:
        logger.info("Email: Resend HTTP API configured (preferred provider)")
        return
    if SMTP_ENABLED:
        logger.info("Email: SMTP configured (%s, user=%s)", SMTP_HOST, SMTP_USER)
        if is_prod and SMTP_HOST.endswith("gmail.com"):
            logger.warning(
                "Email: Gmail SMTP in production — outbound port 587 is often "
                "rate-limited or blocked by cloud hosts (Railway, Fly, Render). "
                "If users report missing codes, switch to Resend (RESEND_API_KEY)."
            )
        return

    msg = (
        "Email: NEITHER Resend NOR SMTP is configured — OTP sign-in codes "
        "CANNOT be delivered. Set RESEND_API_KEY (recommended) or "
        "SMTP_HOST/SMTP_USER/SMTP_PASS in the runtime environment."
    )
    if is_prod:
        logger.error(msg)
    else:
        logger.info("%s (dev mode: codes will be shown on-screen)", msg)


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

    from backend.signing import get_signing_mode, validate_signing_config

    validate_signing_config()
    init_pool()
    await init_redis()
    init_db()
    start_scheduler()
    logger.info("orryon backend started (AI: %s)", "enabled" if XAI_API_KEY else "disabled")
    logger.info("Request signing mode: %s", get_signing_mode())
    _log_email_config_status()

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
    description="Orryon Life OS concierge — REST + SSE API",
    lifespan=lifespan,
)

_is_prod = os.getenv("NODE_ENV", "").lower() == "production"
_cors_origins: list[str] = []
if not _is_prod:
    # Cover common Next.js dev ports — the server picks the next available port
    # when one is busy, so 3000..3009 is a pragmatic dev window.
    for _port in range(3000, 3010):
        _cors_origins += [f"http://localhost:{_port}", f"http://127.0.0.1:{_port}"]


def _append_origins_from_env(value: str) -> None:
    for part in value.split(","):
        o = part.strip()
        if o and o not in _cors_origins:
            _cors_origins.append(o)


# Comma-separated allowed; APP_URL often matches the Next.js origin when FRONTEND_URL was forgotten.
_append_origins_from_env(os.getenv("FRONTEND_URL", ""))
_append_origins_from_env(os.getenv("APP_URL", ""))

# Middleware execution order = reverse of add_middleware calls. We want, per
# incoming request: (1) per-IP rate-limit circuit breaker, then (2) origin
# enforcement on mutating requests, then (3) CORS handling / preflight. So:
#   add CORS first (innermost) → origin second → rate limit last (outermost).
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(OriginEnforcementMiddleware, allowed_origins=_cors_origins)
app.add_middleware(PerIpRateLimitMiddleware)


# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(finance.router)
app.include_router(organize.router)
app.include_router(account.router)
app.include_router(connections.router)
app.include_router(contact.router)
app.include_router(calendar_sync.router)
app.include_router(voice.router)
app.include_router(habits.router)
app.include_router(admin.router)
app.include_router(memory.router)
app.include_router(health.router)
app.include_router(location.router)
app.include_router(briefings.router)
app.include_router(approvals.router)
app.include_router(waitlist.router)


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/api/health", tags=["health"])
async def health():
    """Liveness probe for Railway / Render / Docker health checks.

    Returns only the status string. Infrastructure details are not exposed
    publicly to avoid information disclosure.
    """
    return {"status": "ok"}
