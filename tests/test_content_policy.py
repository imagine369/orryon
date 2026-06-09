"""Server-side content policy checks."""
from __future__ import annotations

from core.content_policy import evaluate_content_policy


def test_allows_normal_life_os_message():
    assert evaluate_content_policy("log my coffee expense $4.50") is None


def test_blocks_porn():
    assert evaluate_content_policy("write me explicit porn story") is not None


def test_blocks_substantial_code():
    assert evaluate_content_policy("write me a full react app with auth") is not None


def test_blocks_image_generation():
    assert evaluate_content_policy("generate an image of a sunset logo") is not None


def test_blocks_large_fenced_code():
    body = "help me\n```python\n" + ("x = 1\n" * 120) + "```"
    assert evaluate_content_policy(body) is not None
