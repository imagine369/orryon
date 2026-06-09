"""Production signing configuration and expensive-route dependencies."""
from __future__ import annotations

import os
from unittest.mock import patch

import pytest

from backend.signing import get_signing_mode, validate_signing_config


def test_production_requires_enforce_mode():
    with (
        patch.dict(
            os.environ,
            {"REQUEST_SIGNING_MODE": "off", "JWT_SECRET": "x" * 64},
            clear=False,
        ),
        patch("backend.deps.IS_PRODUCTION", True),
    ):
        with pytest.raises(RuntimeError, match="REQUEST_SIGNING_MODE must be 'enforce'"):
            validate_signing_config()


def test_production_enforce_mode_passes():
    with (
        patch.dict(
            os.environ,
            {"REQUEST_SIGNING_MODE": "enforce", "JWT_SECRET": "x" * 64},
            clear=False,
        ),
        patch("backend.deps.IS_PRODUCTION", True),
    ):
        validate_signing_config()
        assert get_signing_mode() == "enforce"


def test_chat_and_voice_routes_require_signing_dependency():
    from backend.main import app

    signed_paths = {
        ("/api/chat", "POST"),
        ("/api/voice/stt", "POST"),
        ("/api/voice/tts", "POST"),
        ("/api/voice/orb-tts", "POST"),
    }
    found = set()
    for route in app.routes:
        path = getattr(route, "path", "")
        methods = getattr(route, "methods", None) or set()
        for method in methods:
            if (path, method) in signed_paths:
                dep_names = []
                for dep in getattr(route, "dependant", None).dependencies or []:
                    if dep.call:
                        dep_names.append(getattr(dep.call, "__name__", ""))
                assert "require_signed_request" in dep_names, f"{method} {path}"
                found.add((path, method))
    assert found == signed_paths
