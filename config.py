"""
config.py — Central configuration for guddd Personal Finance Dashboard.

All secrets are read from environment variables (loaded from .env).
NEVER hardcode API keys here. Use .env.example as a template.

LLM:
  Grok (xAI) via langchain-xai. Set LLM_PROVIDER=grok and XAI_API_KEY in .env.
  GROK_MODEL=grok-latest auto-tracks the newest Grok release.
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
#   grok-3-mini        — fast + cheap, great for most tasks
#   grok-3             — smarter, slower, better for complex queries
#   grok-3-mini-fast   — fastest, cheapest (for high-volume use)
XAI_API_KEY: str = os.getenv("XAI_API_KEY", "")
GROK_MODEL: str = os.getenv("GROK_MODEL", "grok-3-mini")

# Ollama (local fallback — not used in v1 rebuild but kept for compatibility)
OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "llama3.1")


def get_llm(temperature: float = 0.1):
    """
    Returns the configured LangChain chat model.

    "grok"   → ChatXAI with GROK_MODEL (default: grok-latest).
               grok-latest automatically upgrades whenever xAI ships a new model,
               so your agents always run on the most current Grok — zero code changes.
    "ollama" → ChatOllama running locally (100% private, no cloud).

    No OpenAI dependency anywhere in this project.
    """
    if LLM_PROVIDER == "grok":
        if not XAI_API_KEY:
            raise RuntimeError(
                "XAI_API_KEY is not set. Add it to your .env file.\n"
                "Get a key at: https://console.x.ai"
            )
        try:
            from langchain_xai import ChatXAI
            logger.info("Using Grok LLM: %s", GROK_MODEL)
            return ChatXAI(
                model=GROK_MODEL,
                xai_api_key=XAI_API_KEY,
                temperature=temperature,
            )
        except ImportError:
            raise RuntimeError(
                "langchain-xai is not installed. Run: pip install langchain-xai"
            )

    # Ollama fallback — local/private
    try:
        from langchain_ollama import ChatOllama
        logger.info("Using Ollama LLM: %s at %s", OLLAMA_MODEL, OLLAMA_BASE_URL)
        return ChatOllama(
            model=OLLAMA_MODEL,
            base_url=OLLAMA_BASE_URL,
            temperature=temperature,
        )
    except ImportError:
        raise RuntimeError(
            "langchain-ollama is not installed. Run: pip install langchain-ollama"
        )


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

# ── Local Storage ─────────────────────────────────────────────────────────────
DB_PATH: str = os.getenv("DB_PATH", "finance.db")
NOTES_DIR: str = os.getenv("NOTES_DIR", "notes")
ICS_CALENDAR_PATH: str = os.getenv("ICS_CALENDAR_PATH", "calendar.ics")

# ── Security ──────────────────────────────────────────────────────────────────
# Optional Fernet key for at-rest encryption of sensitive DB fields.
# Generate: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
ENCRYPTION_KEY: str = os.getenv("ENCRYPTION_KEY", "")

# ── User ──────────────────────────────────────────────────────────────────────
USER_ID: str = os.getenv("USER_ID", "default_user")

# ── Public URL (used for share links) ─────────────────────────────────────────
# Change this to your deployed URL in production, e.g. https://guddd.app
APP_URL: str = os.getenv("APP_URL", "http://localhost:8501")

# ── Email / SMTP (for OTP verification codes) ─────────────────────────────────
# Works with any SMTP provider. Leave blank to use on-screen dev mode.
#
# Gmail setup:
#   1. Enable 2FA on your Google account
#   2. Go to myaccount.google.com → Security → App Passwords
#   3. Generate an App Password and paste it as SMTP_PASS
#
# Provider reference:
#   Gmail   : smtp.gmail.com         port 587
#   Outlook : smtp-mail.outlook.com  port 587
#   iCloud  : smtp.mail.me.com       port 587
#   Yahoo   : smtp.mail.yahoo.com    port 587
SMTP_HOST: str = os.getenv("SMTP_HOST", "")
SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER: str = os.getenv("SMTP_USER", "")
SMTP_PASS: str = os.getenv("SMTP_PASS", "")
SMTP_FROM: str = os.getenv("SMTP_FROM", SMTP_USER)
SMTP_ENABLED: bool = bool(SMTP_HOST and SMTP_USER and SMTP_PASS)

# ── Ensure directories exist ──────────────────────────────────────────────────
os.makedirs(NOTES_DIR, exist_ok=True)
