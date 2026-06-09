"""Locale-aware tool intent detection."""
from __future__ import annotations

from core.agent_shared import needs_tool_reprompt
from core.intent_classifier import message_is_live_news_query, message_suggests_tool_action


def test_english_action_verbs():
    assert message_suggests_tool_action("log my coffee expense", "en")
    assert not message_suggests_tool_action("hello there", "en")


def test_spanish_action_verbs():
    assert message_suggests_tool_action("registrar un gasto de café", "es")
    assert message_suggests_tool_action("cuánto gasté este mes", "es")


def test_french_action_verbs():
    assert message_suggests_tool_action("ajouter une dépense", "fr")


def test_japanese_action_keywords():
    assert message_suggests_tool_action("コーヒーを記録して", "ja")


def test_spanish_news_not_action():
    assert message_is_live_news_query("qué noticias hay hoy", "es")


def test_needs_tool_reprompt_spanish():
    assert needs_tool_reprompt("registrar gasto de taxi", [], "", language="es")


def test_no_reprompt_spanish_news():
    assert not needs_tool_reprompt(
        "qué noticias hay hoy",
        [],
        "Aquí tienes titulares.",
        language="es",
    )
