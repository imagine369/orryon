"""scripts/verify_prod.py — production env checklist."""
from __future__ import annotations

import importlib.util
import os
from pathlib import Path
from unittest.mock import patch

import pytest

ROOT = Path(__file__).resolve().parents[1]

_PROD_BASE_ENV = {
    "NODE_ENV": "production",
    "JWT_SECRET": "x" * 64,
    "REQUEST_SIGNING_MODE": "enforce",
    "ENABLE_DEMO": "0",
    "FRONTEND_URL": "https://www.orryon.com",
    "APP_URL": "https://www.orryon.com",
    "DATABASE_URL": "postgres://example",
    "REDIS_URL": "redis://example",
    "XAI_API_KEY": "test-xai-key",
    "RESEND_API_KEY": "re_test",
}


def _load_verify_prod():
    """Load a fresh copy so per-test env patches apply at import time."""
    name = "verify_prod_under_test"
    path = ROOT / "scripts" / "verify_prod.py"
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _prime_prod_module(vp) -> None:
    """config.py is imported once per session in pytest — set attrs the script reads."""
    vp.DATABASE_URL = _PROD_BASE_ENV["DATABASE_URL"]
    vp.REDIS_URL = _PROD_BASE_ENV["REDIS_URL"]


def test_collect_production_cors_origins_dedupes():
    with patch.dict(
        os.environ,
        {
            "FRONTEND_URL": "https://www.orryon.com",
            "APP_URL": "https://www.orryon.com",
        },
        clear=False,
    ):
        vp = _load_verify_prod()
        assert vp._collect_production_cors_origins() == ["https://www.orryon.com"]


def test_dev_mode_skips_strict_prod_checks():
    with patch.dict(
        os.environ,
        {
            "NODE_ENV": "development",
            "JWT_SECRET": "x" * 64,
            "XAI_API_KEY": "test-xai-key",
        },
        clear=False,
    ):
        vp = _load_verify_prod()
        assert vp.main() == 0


def test_prod_valid_env_passes():
    with patch.dict(os.environ, _PROD_BASE_ENV, clear=False), patch(
        "backend.deps.IS_PRODUCTION", True
    ):
        vp = _load_verify_prod()
        _prime_prod_module(vp)
        assert vp.main() == 0


def test_prod_missing_origins_fails():
    env = {**_PROD_BASE_ENV, "FRONTEND_URL": "", "APP_URL": ""}
    with patch.dict(os.environ, env, clear=False), patch(
        "backend.deps.IS_PRODUCTION", True
    ):
        vp = _load_verify_prod()
        _prime_prod_module(vp)
        assert vp.main() == 1


def test_prod_short_jwt_reports_single_failure(capsys):
    env = {**_PROD_BASE_ENV, "JWT_SECRET": "short"}
    with patch.dict(os.environ, env, clear=False), patch(
        "backend.deps.IS_PRODUCTION", True
    ):
        vp = _load_verify_prod()
        _prime_prod_module(vp)
        assert vp.main() == 1

    out = capsys.readouterr().out
    assert "JWT_SECRET missing or too short" in out
    assert sum(1 for line in out.splitlines() if line.strip().startswith("✗")) == 1


def test_prod_empty_jwt_reports_single_failure(capsys):
    env = {**_PROD_BASE_ENV, "JWT_SECRET": ""}
    with patch.dict(os.environ, env, clear=False), patch(
        "backend.deps.IS_PRODUCTION", True
    ):
        vp = _load_verify_prod()
        _prime_prod_module(vp)
        assert vp.main() == 1

    out = capsys.readouterr().out
    assert "JWT_SECRET must be set in production" in out
    assert sum(1 for line in out.splitlines() if line.strip().startswith("✗")) == 1
