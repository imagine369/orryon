"""API smoke — liveness and app import."""
from __future__ import annotations

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
    """
    Readiness is set by background startup in production; httpx ASGITransport does
    not schedule that task, so we run startup explicitly then assert /api/ready.
    """
    import backend.main as m

    m._startup_ready = False
    m._startup_error = None

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        starting = await client.get("/api/ready")
        assert starting.status_code == 503
        assert starting.json()["status"] == "starting"

        await m._run_startup()

        ready = await client.get("/api/ready")
        assert ready.status_code == 200
        assert ready.json() == {"status": "ok"}
