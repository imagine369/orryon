#!/usr/bin/env python3
"""
Live production smoke test (no auth — safe to run against api.orryon.com).

Usage:
  python3 scripts/prod_smoke_live.py
  PROD_API_BASE=https://api.orryon.com PROD_WEB_BASE=https://www.orryon.com python3 scripts/prod_smoke_live.py
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

API = os.getenv("PROD_API_BASE", "https://api.orryon.com").rstrip("/")
WEB = os.getenv("PROD_WEB_BASE", "https://www.orryon.com").rstrip("/")
UA = "OrryonProdSmoke/1.0"


def _ok(name: str, detail: str = "") -> None:
    line = f"  ✓ {name}"
    if detail:
        line += f" — {detail}"
    print(line)


def _fail(name: str, detail: str = "") -> None:
    line = f"  ✗ {name}"
    if detail:
        line += f" — {detail}"
    print(line)


def _request(method: str, url: str, body: dict | None = None) -> tuple[int, str]:
    data = None
    headers = {"User-Agent": UA}
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.status, resp.read().decode()[:400]
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode()[:400]


def main() -> int:
    errors = 0
    print("Orryon production smoke (automated)\n")
    print(f"API: {API}")
    print(f"Web: {WEB}\n")

    print("Infrastructure")
    for path, expect in [("/api/health", "ok"), ("/api/ready", "ok")]:
        status, body = _request("GET", f"{API}{path}")
        if status == 200 and '"ok"' in body:
            _ok(f"GET {path}", body.strip()[:60])
        else:
            _fail(f"GET {path}", f"status={status} body={body[:80]}")
            errors += 1

    status, body = _request("GET", f"{WEB}/api/health")
    if status == 200 and "ok" in body:
        _ok("Frontend proxy GET /api/health", "Vercel → backend")
    else:
        _fail("Frontend proxy /api/health", f"status={status}")
        errors += 1

    status, _ = _request("GET", f"{WEB}/login")
    if status == 200:
        _ok("GET /login page")
    else:
        _fail("GET /login", f"status={status}")
        errors += 1

    print("\nAuth surface (unauthenticated)")
    status, body = _request("POST", f"{API}/api/auth/send-code", {"email": "not-valid"})
    if status == 400:
        _ok("POST /api/auth/send-code invalid email", "400 as expected")
    else:
        _fail("POST /api/auth/send-code invalid email", f"status={status}")
        errors += 1

    status, body = _request("POST", f"{API}/api/chat", {"message": "ping"})
    if status in (401, 403):
        _ok("POST /api/chat without session", f"{status} — auth required")
    else:
        _fail("POST /api/chat without session", f"status={status} {body[:80]}")
        errors += 1

    status, _ = _request("POST", f"{API}/api/auth/demo", {})
    if status in (403, 404, 405):
        _ok("POST /api/auth/demo", "disabled in production")
    elif status == 200:
        _fail("POST /api/auth/demo", "demo login enabled — set ENABLE_DEMO off")
        errors += 1
    else:
        _ok("POST /api/auth/demo", f"status={status}")

    print("\nManual checks (you — ~15 min)")
    manual = [
        "Sign-in: /login → enter your email → OTP arrives (Resend)",
        "Chat: /home → send 'What can you help me with?' → streaming reply",
        "Health: ask 'I have a mild headache' → answer + disclaimer under chat",
        "Delete: create a note/expense → delete → modal → confirm → gone",
        "Finance: dashboard loads balances or empty state without errors",
    ]
    for i, line in enumerate(manual, 1):
        print(f"  {i}. [ ] {line}")

    print("\nRailway logs to confirm")
    print("  · ORRYON_BOOT_v3 and ROOT=/.orryon")
    print("  · orryon backend started (AI: enabled)")
    print("  · If chat fails: xAI HEAD 401 → re-paste XAI_API_KEY in Railway (no spaces)")

    if errors:
        print(f"\n{errors} automated check(s) failed.")
        return 1
    print("\nAutomated checks passed. Complete the manual checklist above.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
