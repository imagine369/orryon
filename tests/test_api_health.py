"""API smoke — liveness and app import."""
from __future__ import annotations

import asyncio

import pytest
from httpx import ASGITransport, AsyncClient

from backend.main import app


@pytest.mark.asyncio
async def test_api_health_ok():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        body = None
        for _ in range(100):
            res = await client.get("/api/health")
            assert res.status_code == 200
            body = res.json()
            if body.get("status") == "ok":
                break
            await asyncio.sleep(0.05)
    assert body == {"status": "ok"}
