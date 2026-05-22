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


async def _api_health() -> bool:
    from httpx import ASGITransport, AsyncClient
    from backend.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/health")
    return res.status_code == 200 and res.json().get("status") == "ok"


def _tools_smoke() -> bool:
    from db import init_db, get_or_create_user_by_email
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
