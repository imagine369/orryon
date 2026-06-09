#!/usr/bin/env python3
"""
Production readiness check — env vars + optional live health probe.

Usage (from repo root):
  .venv/bin/python scripts/verify_prod.py
  VERIFY_PROD_URL=https://api.orryon.com .venv/bin/python scripts/verify_prod.py

Exits 0 when all required checks pass, 1 otherwise.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path
import urllib.request
from urllib.request import urlopen
from urllib.error import URLError

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")

from config import (
    DATABASE_URL,
    REDIS_URL,
    RESEND_ENABLED,
    SMTP_ENABLED,
    XAI_API_KEY,
)

JWT_SECRET = os.getenv("JWT_SECRET", "")


def _collect_production_cors_origins() -> list[str]:
    """Mirror backend/main.py production CORS origin assembly (no localhost dev ports)."""
    origins: list[str] = []
    for key in ("FRONTEND_URL", "APP_URL"):
        for part in os.getenv(key, "").split(","):
            origin = part.strip()
            if origin and origin not in origins:
                origins.append(origin)
    return origins


def _ok(msg: str) -> None:
    print(f"  ✓ {msg}")


def _fail(msg: str) -> None:
    print(f"  ✗ {msg}")


def main() -> int:
    errors = 0
    is_prod = os.getenv("NODE_ENV", "").lower() == "production"

    print("Orryon production verification\n")

    print("Environment")

    if is_prod:
        from backend.middleware import validate_origin_config
        from backend.signing import get_signing_mode, validate_signing_config

        try:
            validate_signing_config()
            if len(os.getenv("JWT_SECRET", "").strip()) < 32:
                raise RuntimeError("JWT_SECRET missing or too short (need 32+ chars)")
            _ok("JWT_SECRET is set")
            _ok(f"Request signing mode: {get_signing_mode()}")
        except RuntimeError as exc:
            _fail(str(exc))
            errors += 1
    elif JWT_SECRET and len(JWT_SECRET) >= 32:
        _ok("JWT_SECRET is set")
    else:
        _fail("JWT_SECRET missing or too short (need 32+ chars)")
        errors += 1

    if XAI_API_KEY:
        _ok("XAI_API_KEY is set")
    else:
        _fail("XAI_API_KEY not set")
        errors += 1

    if is_prod:
        if os.getenv("ENABLE_DEMO", "").lower() not in ("1", "true", "yes"):
            _ok("ENABLE_DEMO is off")
        else:
            _fail("ENABLE_DEMO must be off in production")
            errors += 1

        if RESEND_ENABLED or SMTP_ENABLED:
            _ok("Email delivery configured (Resend or SMTP)")
        else:
            _fail("No email provider — OTP sign-in will fail")
            errors += 1

        try:
            origins = _collect_production_cors_origins()
            validate_origin_config(origins)
            _ok(f"Origin allowlist configured ({', '.join(origins)})")
        except RuntimeError as exc:
            _fail(str(exc))
            errors += 1

        if DATABASE_URL:
            _ok("DATABASE_URL set (Postgres)")
        else:
            _fail("DATABASE_URL not set — production should use Postgres")
            errors += 1

        if REDIS_URL:
            _ok("REDIS_URL set")
        else:
            _fail("REDIS_URL not set — rate limits/cache may differ per worker")
            errors += 1
    else:
        print("  (NODE_ENV is not production — skipping strict prod-only checks)")

    base = os.getenv("VERIFY_PROD_URL", "").rstrip("/")
    if base:
        print(f"\nLive probe ({base})")
        for path in ("/api/health", "/api/ready"):
            try:
                req = urllib.request.Request(
                    f"{base}{path}",
                    headers={"User-Agent": "OrryonVerifyProd/1.0"},
                )
                with urlopen(req, timeout=15) as resp:
                    body = resp.read().decode()
                if resp.status == 200 and "ok" in body:
                    _ok(f"{path} responded")
                else:
                    _fail(f"{path} unexpected: {body[:120]}")
                    errors += 1
            except URLError as exc:
                _fail(f"{path} failed: {exc}")
                errors += 1
    else:
        print("\nLive probe skipped (set VERIFY_PROD_URL=https://api.orryon.com)")

    print("\nRedeploy reminder")
    print("  1. git push main → Railway/Vercel auto-deploy")
    print("  2. Confirm backend service restarted (new commit on main)")
    print("  3. Re-run: VERIFY_PROD_URL=https://api.orryon.com python scripts/verify_prod.py")

    if errors:
        print(f"\n{errors} check(s) failed.")
        return 1
    print("\nAll checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
