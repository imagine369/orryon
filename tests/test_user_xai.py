from core.user_xai import mask_xai_key, validate_xai_key
import pytest


def test_validate_xai_key_rejects_empty():
    with pytest.raises(ValueError):
        validate_xai_key("  ")


def test_validate_xai_key_strips():
    assert validate_xai_key("  xai-abcdefghijklmnopqrstuv  ").startswith("xai-")


def test_mask_xai_key():
    assert mask_xai_key("xai-abcdefghijklmnopqrstuv") == "xai-…stuv"
