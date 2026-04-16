"""
backend/main.py — FastAPI application for orryon.

This is the assembly point: it creates the FastAPI app, applies middleware,
registers all routers, and starts the background scheduler. Route handlers
live in backend/routers/ — see each module for endpoint documentation.

Run from project root:
    uvicorn backend.main:app --reload --port 8000

The Next.js frontend (frontend/) connects to this server via the
NEXT_PUBLIC_API_URL environment variable (default: http://localhost:8000).

Router layout:
    /api/auth/*           → routers/auth.py       (OTP sign-in, demo, JWT)
    /api/chat             → routers/chat.py        (SSE streaming AI chat)
    /api/dashboard/*      → routers/finance.py     (dashboard, transactions, budget, bills, forecast)
    /api/transactions/*   → routers/finance.py
    /api/budget/*         → routers/finance.py
    /api/bills/*          → routers/finance.py
    /api/income           → routers/finance.py
    /api/net-worth        → routers/finance.py
    /api/forecast         → routers/finance.py
    /api/events/*         → routers/organize.py    (events, goals, notes, tasks, lists, grocery)
    /api/goals/*          → routers/organize.py
    /api/notes/*          → routers/organize.py
    /api/tasks/*          → routers/organize.py
    /api/grocery/*        → routers/organize.py
    /api/lists/*          → routers/organize.py
    /api/settings/*       → routers/account.py     (settings, billing, export, share)
    /api/account          → routers/account.py
    /api/export           → routers/account.py
    /api/share/*          → routers/account.py
    /api/subscription/*   → routers/account.py
    /api/stripe/*         → routers/account.py
    /api/receipts/*       → routers/account.py
    /api/connections/*    → routers/connections.py  (CSV import, Plaid bank link)
    /api/import/*         → routers/connections.py
    /api/contact          → routers/contact.py      (contact form email)
    /api/calendar/*       → routers/calendar_sync.py (ICS import + Google OAuth)
    /api/health           → (below)
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
from core.scheduler import start_scheduler, stop_scheduler

# ── Sentry Setup ─────────────────────────────────────────────────────────────
_sentry_dsn = os.getenv("SENTRY_DSN", "")
if _sentry_dsn:
    sentry_sdk.init(
        dsn=_sentry_dsn,
        traces_sample_rate=0.2,
        profiles_sample_rate=0.1,  # Requires traces_sample_rate > 0
        environment=os.getenv("NODE_ENV", "development"),
        integrations=[
            StarletteIntegration(transaction_style="endpoint"),
            FastApiIntegration(transaction_style="endpoint"),
        ],
        send_default_pii=False,  # Set to True if you want user data
    )
    print("✅ Sentry initialized for backend")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(name)s  %(levelname)s  %(message)s",
)
logger = logging.getLogger(__name__)


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start the APScheduler background jobs on startup, stop on shutdown."""
    start_scheduler()
    logger.info("orryon backend started (AI: %s)", "enabled" if XAI_API_KEY else "disabled")
    yield
    stop_scheduler()


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="orryon",
    version="2.0",
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
    return {"status": "ok", "version": "2.0", "ai": bool(XAI_API_KEY)}
