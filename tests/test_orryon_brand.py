"""Tests for orryon brand spelling normalization."""
from core.orryon_brand import (
    normalize_orryon_in_assistant_reply,
    user_asks_orion_astronomy,
    user_likely_addressing_orryon,
)


def test_user_addressing_orryon_homophones():
    assert user_likely_addressing_orryon("Oriana, what's the weather?")
    assert user_likely_addressing_orryon("Hey Orryon")
    assert not user_likely_addressing_orryon("What's the weather in SF?")


def test_orion_astronomy_not_addressing():
    assert user_asks_orion_astronomy("Tell me about the Orion constellation")
    assert not user_likely_addressing_orryon("Tell me about the Orion constellation")


def test_normalize_reply_fixes_oriana():
    out = normalize_orryon_in_assistant_reply(
        "Hi Oriana here — I can help.",
        "Oriana, weather?",
    )
    assert "Oriana" not in out
    assert "orryon" in out


def test_preserve_orion_astronomy():
    text = "Orion is a prominent constellation with Rigel and Betelgeuse."
    assert normalize_orryon_in_assistant_reply(text, "Orion constellation") == text
