"""
config.py — Central configuration for guddd Personal Finance Dashboard.

All secrets are read from environment variables (loaded from .env).
NEVER hardcode API keys here. Use .env.example as a template.

LLM Priority:
  1. Grok (default) — xAI's cloud LLM via langchain-xai. No OpenAI dependency.
                       Set LLM_PROVIDER=grok and XAI_API_KEY in .env.
                       GROK_MODEL=grok-latest auto-tracks the newest Grok release.
  2. Ollama (fallback) — 100% local/private. Set LLM_PROVIDER=ollama.

OpenAI is intentionally not supported.
"""

import os
import logging
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# ── LLM Configuration ─────────────────────────────────────────────────────────
# Default provider is "grok". Set LLM_PROVIDER=ollama in .env for local mode.
LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "grok")

# Grok (xAI) — grok-latest always tracks the newest released Grok model.
# Change to e.g. "grok-3" if you want a pinned, stable version.
XAI_API_KEY: str = os.getenv("XAI_API_KEY", "")
GROK_MODEL: str = os.getenv("GROK_MODEL", "grok-latest")

# Ollama (local fallback)
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

# ── Ensure directories exist ──────────────────────────────────────────────────
os.makedirs(NOTES_DIR, exist_ok=True)
