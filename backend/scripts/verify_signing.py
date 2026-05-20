#!/usr/bin/env python3
"""
Verify HMAC request signing end-to-end against the FastAPI app.

Usage (from repo root):
  .venv/bin/python backend/scripts/verify_signing.py

Requires JWT_SECRET in the environment (or .env loaded by config).
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import time

# Repo root on sys.path
_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

os.environ.setdefault("NODE_ENV", "development")
os.environ.setdefault("REQUEST_SIGNING_MODE", "enforce")
os.environ.setdefault("FRONTEND_URL", "http://localhost:3001")
os.environ.setdefault("DB_PATH", os.path.join(_ROOT, "finance.db"))

from httpx import ASGITransport, AsyncClient

from backend.auth import create_token, decode_token, jwt_iat_unix
from backend.main import app
from backend.signing import _compute_signature, derive_signing_key, get_signing_mode
from db import get_or_create_user_by_email, init_db, update_row


async def main() -> None:
    init_db()
    user = get_or_create_user_by_email("signing-verify@orryon.app")
    update_row(
        "users",
        {"plan": "trial", "trial_ends_at": "2099-01-01T00:00:00+00:00"},
        {"id": user["id"]},
    )
    token = create_token(user["id"], user["email"])
    iat = jwt_iat_unix(decode_token(token))
    key = derive_signing_key(user["id"], iat)
    origin = {"Origin": os.environ.get("FRONTEND_URL", "http://localhost:3001")}

    print(f"signing mode: {get_signing_mode()}")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r = await client.post(
            "/api/auth/sign-key",
            headers={**origin, "Authorization": f"Bearer {token}"},
        )
        if r.status_code != 200:
            print(f"FAIL sign-key: {r.status_code} {r.text}")
            sys.exit(1)
        if r.json().get("key") != key:
            print("FAIL sign-key: derived key mismatch")
            sys.exit(1)
        print("OK  POST /api/auth/sign-key")

        r2 = await client.post(
            "/api/chat",
            headers={**origin, "Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"message": "ping", "session_id": ""},
        )
        if r2.status_code != 401:
            print(f"FAIL unsigned chat: expected 401, got {r2.status_code}")
            sys.exit(1)
        print("OK  POST /api/chat unsigned → 401")

        body = json.dumps({"message": "ping", "session_id": ""}).encode()
        ts = str(int(time.time()))
        nonce = f"verify-{int(time.time() * 1000)}"
        sig = _compute_signature(key, "POST", "/api/chat", body, ts, nonce)
        r3 = await client.post(
            "/api/chat",
            headers={
                **origin,
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "X-Orryon-Sig": sig,
                "X-Orryon-Ts": ts,
                "X-Orryon-Nonce": nonce,
            },
            content=body,
        )
        if r3.status_code == 401 and "signature" in r3.text.lower():
            print(f"FAIL signed chat: signature rejected — {r3.text}")
            sys.exit(1)
        print(f"OK  POST /api/chat signed → {r3.status_code} (signature accepted)")

    print("\nAll signing checks passed.")


if __name__ == "__main__":
    asyncio.run(main())
