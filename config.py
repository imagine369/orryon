"""
config.py — Central configuration for orryon.

All secrets are read from environment variables (loaded from .env).
NEVER hardcode API keys here. Use .env.example as a template.

LLM:
  Grok (xAI) via direct HTTP (core/grok_agent.py). Set XAI_API_KEY in .env.
  OpenAI is intentionally not supported.

Email OTP auth:
  Set SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM in .env.
  Works with Gmail, Outlook, iCloud, Yahoo, or any SMTP provider.
  If SMTP is not configured, the OTP code is displayed on-screen (dev mode).
"""

import os
import logging
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# ── LLM Configuration ─────────────────────────────────────────────────────────
# Default provider is "grok". Set LLM_PROVIDER=ollama in .env for local mode.
LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "grok")

# ── Grok (xAI) — direct API, OpenAI-compatible ──────────────────────────────
# Get your key at https://console.x.ai
# Recommended models (set GROK_MODEL in .env):
#   grok-4-fast-non-reasoning-latest  — lowest TTFT, ideal for consumer chat
#   grok-3-mini-fast                  — budget fallback, still fast
#   grok-3-mini                       — balanced (previous default)
#   grok-3                            — smarter, slower, complex queries only
XAI_API_KEY: str = os.getenv("XAI_API_KEY", "")
XAI_API_KEYS: list[str] = [
    k.strip() for k in os.getenv("XAI_API_KEYS", "").split(",") if k.strip()
]
GROK_MODEL: str = os.getenv("GROK_MODEL", "grok-4-fast-non-reasoning-latest")

# Ollama (local fallback — not used in v1 rebuild but kept for compatibility)
OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "llama3.1")



# ── Banking — Plaid ───────────────────────────────────────────────────────────
PLAID_CLIENT_ID: str = os.getenv("PLAID_CLIENT_ID", "")
PLAID_SECRET: str = os.getenv("PLAID_SECRET", "")
PLAID_ENV: str = os.getenv("PLAID_ENV", "sandbox")
PLAID_ACCESS_TOKEN: str = os.getenv("PLAID_ACCESS_TOKEN", "")
PLAID_ENABLED: bool = bool(PLAID_CLIENT_ID and PLAID_SECRET)

# ── Market Data ───────────────────────────────────────────────────────────────
POLYGON_API_KEY: str = os.getenv("POLYGON_API_KEY", "")
USE_POLYGON: bool = bool(POLYGON_API_KEY)

# ── Google Calendar (optional) ────────────────────────────────────────────────
GOOGLE_CALENDAR_CREDENTIALS: str = os.getenv(
    "GOOGLE_CALENDAR_CREDENTIALS", "credentials.json"
)
GOOGLE_CALENDAR_TOKEN: str = os.getenv("GOOGLE_CALENDAR_TOKEN", "token.json")
GOOGLE_CALENDAR_ID: str = os.getenv("GOOGLE_CALENDAR_ID", "primary")
USE_GOOGLE_CALENDAR: bool = os.path.exists(GOOGLE_CALENDAR_CREDENTIALS)

# ── Database ──────────────────────────────────────────────────────────────────
# Set DATABASE_URL for Postgres (Supabase). Falls back to SQLite if not set.
DATABASE_URL: str = os.getenv("DATABASE_URL", "")
DB_PATH: str = os.getenv("DB_PATH", "finance.db")

# ── Redis (Upstash) ──────────────────────────────────────────────────────────
REDIS_URL: str = os.getenv("REDIS_URL", "")

# ── Local Storage ─────────────────────────────────────────────────────────────
NOTES_DIR: str = os.getenv("NOTES_DIR", "notes")
ICS_CALENDAR_PATH: str = os.getenv("ICS_CALENDAR_PATH", "calendar.ics")

# ── Security ──────────────────────────────────────────────────────────────────
# Optional Fernet key for at-rest encryption of sensitive DB fields.
# Generate: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
ENCRYPTION_KEY: str = os.getenv("ENCRYPTION_KEY", "")

# ── User ──────────────────────────────────────────────────────────────────────
USER_ID: str = os.getenv("USER_ID", "default_user")

# ── Public URL (used for share links + Stripe portal return) ─────────────────
# Change this to your deployed URL in production, e.g. https://orryon.app
APP_URL: str = os.getenv("APP_URL", "http://localhost:3000")

# ── Email ─────────────────────────────────────────────────────────────────────
# Preferred: Resend HTTP API (works on Railway where outbound SMTP is blocked).
# Fallback: classic SMTP for local dev or other hosts.
#
# Resend setup (production):
#   1. Sign up at https://resend.com, verify your domain.
#   2. Create an API key with Full access.
#   3. Set RESEND_API_KEY=re_xxxx in the runtime environment.
#   4. Set SMTP_FROM to a verified sender address on your domain.
#
# SMTP setup (local dev only — most cloud hosts block port 587):
#   Gmail   : smtp.gmail.com         port 587 (App Password required)
#   Outlook : smtp-mail.outlook.com  port 587
#   iCloud  : smtp.mail.me.com       port 587
SMTP_HOST: str = os.getenv("SMTP_HOST", "")
SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER: str = os.getenv("SMTP_USER", "")
SMTP_PASS: str = os.getenv("SMTP_PASS", "")
SMTP_ENABLED: bool = bool(SMTP_HOST and SMTP_USER and SMTP_PASS)

# Resend HTTP API — preferred over SMTP when set.
RESEND_API_KEY: str = os.getenv("RESEND_API_KEY", "")
RESEND_ENABLED: bool = bool(RESEND_API_KEY)

# Recipient for contact form submissions + admin notifications.
# Falls back to SMTP_USER for back-compat with older deploys.
CONTACT_EMAIL: str = os.getenv("CONTACT_EMAIL", "") or SMTP_USER

# Sender address used in outbound emails (Resend "from" + SMTP From header).
# Resolution order: SMTP_FROM → SMTP_USER → CONTACT_EMAIL.
SMTP_FROM: str = os.getenv("SMTP_FROM", "") or SMTP_USER or CONTACT_EMAIL

ATTACHMENTS_DIR: str = os.getenv("ATTACHMENTS_DIR", "attachments")
# ── Stripe (billing) ──────────────────────────────────────────────────────────
# Set up at https://dashboard.stripe.com
# Test keys start with sk_test_ / pk_test_
STRIPE_SECRET_KEY: str = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET: str = os.getenv("STRIPE_WEBHOOK_SECRET", "")

# Price IDs from your Stripe dashboard (set via env vars — no defaults)
STRIPE_PRICE_MONTHLY: str = os.getenv("STRIPE_PRICE_MONTHLY", "")
STRIPE_PRICE_ANNUAL: str = os.getenv("STRIPE_PRICE_ANNUAL", "")
ALLOWED_STRIPE_PRICES: set[str] = {p for p in (STRIPE_PRICE_MONTHLY, STRIPE_PRICE_ANNUAL) if p}

TRIAL_DAYS: int = 14

def get_trial_days(price_id: str) -> int:
    """Monthly gets 14-day trial. Annual gets no trial (immediate billing)."""
    if price_id == STRIPE_PRICE_ANNUAL:
        return 0
    return TRIAL_DAYS

STRIPE_ENABLED: bool = bool(STRIPE_SECRET_KEY)

# ── Ensure directories exist ──────────────────────────────────────────────────
os.makedirs(NOTES_DIR, exist_ok=True)
os.makedirs(ATTACHMENTS_DIR, exist_ok=True)