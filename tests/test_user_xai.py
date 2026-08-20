from core.user_xai import mask_xai_key, resolve_api_key, validate_xai_key
import pytest


def test_validate_xai_key_rejects_empty():
    with pytest.raises(ValueError):
        validate_xai_key("  ")


def test_validate_xai_key_strips():
    assert validate_xai_key("  xai-abcdefghijklmnopqrstuv  ").startswith("xai-")


def test_mask_xai_key():
    assert mask_xai_key("xai-abcdefghijklmnopqrstuv") == "xai-…stuv"


def test_resolve_api_key_never_uses_server_env(monkeypatch):
    monkeypatch.setattr("core.user_xai.get_user_xai_key", lambda _uid: "")
    monkeypatch.setenv("XAI_API_KEY", "xai-server-key-must-not-be-used")
    assert resolve_api_key("user-1") == ""
