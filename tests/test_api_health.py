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
        res = await client.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_api_ready_after_startup():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        for _ in range(100):
            res = await client.get("/api/ready")
            if res.status_code == 200:
                assert res.json() == {"status": "ok"}
                return
            await asyncio.sleep(0.05)
    pytest.fail("background startup did not become ready in time")
