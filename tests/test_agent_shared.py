"""Tests for shared agent reprompt logic."""
from core.agent_shared import needs_tool_reprompt


def test_reprompt_when_action_verb_and_empty_reply():
    assert needs_tool_reprompt("log my coffee expense", [], "") is True


def test_no_reprompt_when_tool_called():
    assert needs_tool_reprompt("log expense", [{"id": "1"}], "Done.") is False


def test_no_reprompt_when_assistant_asks_question():
    assert needs_tool_reprompt(
        "log expense",
        [],
        "How much was it?",
    ) is False


def test_no_reprompt_for_live_news_query():
    assert needs_tool_reprompt(
        "what's in the news today",
        [],
        "Here are some headlines.",
    ) is False
