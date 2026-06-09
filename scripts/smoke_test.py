#!/usr/bin/env python3
"""
Local smoke test — DB tools + API health (no live Grok call).

Usage (from repo root):
  .venv/bin/python scripts/smoke_test.py

Optional production probe:
  SMOKE_BASE_URL=https://api.orryon.com .venv/bin/python scripts/smoke_test.py
"""
from __future__ import annotations

import asyncio
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.environ.setdefault("NODE_ENV", "development")
os.environ.setdefault("JWT_SECRET", "smoke-test-jwt-secret-32chars-min!!")
os.environ.setdefault("REQUEST_SIGNING_MODE", "off")


def _step(name: str, ok: bool, detail: str = "") -> bool:
    mark = "✓" if ok else "✗"
    line = f"  {mark} {name}"
    if detail:
        line += f" — {detail}"
    print(line)
    return ok


async def _optional_chat_turn() -> bool | None:
    """One live chat turn on staging (SMOKE_BASE_URL + token) or local when opted in."""
    base = os.getenv("SMOKE_BASE_URL", "").rstrip("/")
    token = os.getenv("SMOKE_AUTH_TOKEN", "").strip()
    local_key = os.getenv("XAI_API_KEY", "").strip()
    local_enabled = os.getenv("SMOKE_ENABLE_CHAT", "").lower() in ("1", "true", "yes")

    if base:
        if not token:
            return None
        try:
            import json
            from urllib.request import Request, urlopen

            body = json.dumps({"message": "Reply with one word: ok", "session_id": ""}).encode()
            req = Request(
                f"{base}/api/chat",
                data=body,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                    "Origin": os.getenv("SMOKE_ORIGIN", "https://orryon.com"),
                },
                method="POST",
            )
            with urlopen(req, timeout=90) as resp:
                text = resp.read().decode("utf-8", errors="replace")
            return "data: [DONE]" in text and '"type": "done"' in text
        except Exception as exc:
            print(f"    chat error: {exc}")
            return False

    if not local_key or not local_enabled:
        return None

    from httpx import ASGITransport, AsyncClient
    from backend.auth import create_token
    from backend.main import app
    from db.auth import get_or_create_user_by_email

    user = get_or_create_user_by_email("smoke-chat@orryon.app")
    auth = create_token(user["id"], user["email"], device_name="smoke", ip_address="127.0.0.1")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", timeout=120) as client:
        res = await client.post(
            "/api/chat",
            headers={
                "Authorization": f"Bearer {auth}",
                "Origin": "http://localhost:3000",
            },
            json={"message": "Reply with one word: ok", "session_id": ""},
        )
    if res.status_code != 200:
        return False
    return '"type": "done"' in res.text and "data: [DONE]" in res.text


async def _api_health() -> bool:
    from httpx import ASGITransport, AsyncClient
    from backend.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/health")
    return res.status_code == 200 and res.json().get("status") == "ok"


def _tools_smoke() -> bool:
    from db import init_db
    from db.auth import get_or_create_user_by_email
    from core.tools import execute_tool
    from core.tools.shared import _uid
    from db import insert_row

    init_db()
    uid = get_or_create_user_by_email("smoke@orryon.app")["id"]

    tid = _uid()
    insert_row(
        "transactions",
        {
            "id": tid,
            "user_id": uid,
            "amount": 3.5,
            "merchant": "smoke",
            "description": "test",
            "category": "Other",
            "date": "2026-05-01",
        },
    )

    blocked, _ = execute_tool("delete_expense", {"expense_id": tid}, uid)
    if not blocked.get("needs_confirmation"):
        return False

    ok, _ = execute_tool(
        "delete_expense", {"expense_id": tid, "user_confirmed": True}, uid
    )
    if ok.get("error"):
        return False

    vital, _ = execute_tool(
        "log_health_vital", {"type": "weight", "value": 70, "unit": "kg"}, uid
    )
    return vital.get("status") == "ok"


def _remote_health() -> bool:
    base = os.getenv("SMOKE_BASE_URL", "").rstrip("/")
    if not base:
        return True
    try:
        from urllib.request import urlopen

        with urlopen(f"{base}/api/health", timeout=15) as r:
            return r.status == 200
    except Exception as exc:
        print(f"    remote error: {exc}")
        return False


async def main() -> int:
    print("Orryon smoke test\n")
    fails = 0

    with tempfile.TemporaryDirectory() as tmp:
        os.environ["DB_PATH"] = str(Path(tmp) / "smoke.db")
        os.environ.pop("DATABASE_URL", None)

        api_ok = await _api_health()
        if not api_ok:
            fails += 1
        _step("API /api/health", api_ok)

        tools_ok = _tools_smoke()
        if not tools_ok:
            fails += 1
        _step("Delete confirm gate + health vital tool", tools_ok)

        chat_ok = await _optional_chat_turn()
        if chat_ok is None:
            print(
                "  · Live chat turn skipped "
                "(staging: SMOKE_BASE_URL + SMOKE_AUTH_TOKEN; local: XAI_API_KEY + SMOKE_ENABLE_CHAT=1)"
            )
        else:
            if not chat_ok:
                fails += 1
            _step("Live chat turn (one message)", chat_ok)

    remote = _remote_health()
    if os.getenv("SMOKE_BASE_URL"):
        if not remote:
            fails += 1
        _step(f"Remote {os.getenv('SMOKE_BASE_URL')}/api/health", remote)
    else:
        print("  · Remote probe skipped (set SMOKE_BASE_URL for prod)")

    if fails:
        print(f"\n{fails} smoke check(s) failed.")
        return 1
    print("\nSmoke test passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
