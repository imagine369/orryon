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

import asyncio
import logging
import os
from contextlib import asynccontextmanager

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.middleware import (
    OriginEnforcementMiddleware,
    PerIpRateLimitMiddleware,
    validate_origin_config,
)
from backend.routers import (
    auth,
    chat,
    finance,
    events,
    goals,
    notes,
    tasks,
    lists,
    account_settings,
    account_data,
    receipts,
    billing,
    stripe_webhook,
    connections,
    contact,
    calendar_ics,
    calendar_google,
    voice,
    habits,
    admin,
    memory,
    health,
    location,
    briefings,
    fulfillment,
    approvals,
    audit,
    waitlist,
    waitlist_admin,
)
from config import XAI_API_KEY

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(name)s  %(levelname)s  %(message)s",
)
logger = logging.getLogger(__name__)

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
    logger.info("Sentry initialized for backend")


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


_startup_ready = False
_startup_error: str | None = None


async def _run_startup() -> None:
    """Heavy init runs in the background so /api/health can answer during Railway healthchecks."""
    global _startup_ready, _startup_error
    from db import (
        init_db,
        init_pool,
    )
    from backend.cache import init_redis
    from core.scheduler import start_scheduler
    from backend.signing import get_signing_mode, validate_signing_config
    from core.capability_budget import validate_capability_budget

    try:
        validate_signing_config()
        validate_origin_config(_cors_origins)
        validate_capability_budget()

        try:
            init_pool()
        except Exception as exc:
            import db.connection as conn_mod

            db_path = os.getenv("DB_PATH", "").strip()
            if db_path:
                logger.error(
                    "DATABASE_URL is set but Postgres is unreachable (%s). "
                    "Using SQLite at %s. Unset DATABASE_URL on Railway if you do not use Postgres.",
                    exc,
                    db_path,
                )
                conn_mod._USE_PG = False
                conn_mod._pg_pool = None
            else:
                raise

        await init_redis()
        init_db()
        start_scheduler()
        logger.info("orryon backend started (AI: %s)", "enabled" if XAI_API_KEY else "disabled")
        logger.info("Request signing mode: %s", get_signing_mode())
        _log_email_config_status()

        # Mark ready before optional xAI prewarm so /api/ready and pytest are not
        # blocked on external network (Railway healthchecks, CI).
        _startup_ready = True
        _startup_error = None

        if XAI_API_KEY:
            try:
                from core.grok_agent import get_http_client
                client = get_http_client()
                await client.head("https://api.x.ai/v1/models", timeout=5.0)
                logger.info("xAI connection prewarmed")
            except Exception:
                pass
    except Exception as exc:
        _startup_error = str(exc)
        logger.critical(
            "Background startup failed (fix Railway env vars — see RAILWAY.md): %s", exc
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Yield immediately so Railway healthchecks get HTTP 200 while DB/Redis/scheduler
    init and production config validation run in the background.

    Shutdown:
      1. Close httpx client
      2. Close Redis
      3. Close Postgres pool
      4. Stop scheduler
    """
    from db import close_pool
    from backend.cache import close_redis
    from core.grok_agent import close_http_client
    from core.scheduler import stop_scheduler

    logger.info("orryon backend listening — finishing startup in background")

    startup_task = asyncio.create_task(_run_startup())

    yield

    if not startup_task.done():
        startup_task.cancel()
        try:
            await startup_task
        except asyncio.CancelledError:
            pass
    else:
        exc = startup_task.exception()
        if exc:
            logger.warning("Startup task ended with error during shutdown: %s", exc)

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
app.include_router(events.router)
app.include_router(goals.router)
app.include_router(notes.router)
app.include_router(tasks.router)
app.include_router(lists.router)
app.include_router(account_settings.router)
app.include_router(account_data.router)
app.include_router(receipts.router)
app.include_router(billing.router)
app.include_router(stripe_webhook.router)
app.include_router(connections.router)
app.include_router(contact.router)
app.include_router(calendar_ics.router)
app.include_router(calendar_google.router)
app.include_router(voice.router)
app.include_router(habits.router)
app.include_router(admin.router)
app.include_router(memory.router)
app.include_router(health.router)
app.include_router(location.router)
app.include_router(briefings.router)
app.include_router(fulfillment.router)
app.include_router(audit.router)
app.include_router(approvals.router)
app.include_router(waitlist.router)
app.include_router(waitlist_admin.router)


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/api/health", tags=["health"])
@app.get("/health", tags=["health"], include_in_schema=False)
async def health():
    """Liveness probe for Railway / Render / Docker health checks.

    Always returns HTTP 200 so deploy healthchecks pass while startup finishes.
    Use /api/ready for readiness (DB + config validation complete).
    """
    return {"status": "ok"}


@app.get("/api/ready", tags=["health"], include_in_schema=False)
async def ready():
    """Readiness probe — 503 until background startup completes without error."""
    from fastapi.responses import JSONResponse

    if _startup_error:
        return JSONResponse(
            {"status": "error", "detail": _startup_error},
            status_code=503,
        )
    if not _startup_ready:
        return JSONResponse({"status": "starting"}, status_code=503)
    return {"status": "ok"}
