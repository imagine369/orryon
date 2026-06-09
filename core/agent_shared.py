"""
Shared agent constants and helpers for the Responses API chat loop.

Background tasks (memory extraction, session summary) use Chat Completions via
core/xai_client.call_grok_async — not a second chat path. See docs/PRODUCT_BOUNDARY.md.
"""
from __future__ import annotations

import re

from core.canonical_tools import build_reprompt_note

MAX_TOOL_ROUNDS = 8
HISTORY_WINDOW = 20

CHAT_TEMPERATURE = 0.7
CHAT_MAX_TOKENS = 2048

_ACTION_VERB_RE = re.compile(
    r"\b("
    r"spent|bought|paid|grabbed|picked|dropped|cost|"
    r"log|logged|logging|add|adding|added|"
    r"remind|save|saved|saving|schedule|booked|book|booking|"
    r"create|created|set|update|updated|"
    r"edit|editing|change|changed|rename|renamed|modify|modified|fix|bump|"
    r"delete|deleted|remove|removed|cancel|cancelled|canceled|"
    r"complete|completed|finish|finished|mark|marked|check|checked|"
    r"pin|unpin|"
    r"show|pull|list|find|search|"
    r"news|headlines|headline|breaking|happening|current events|"
    r"in the news|what'?s new|"
    r"how\s+much|how\s+many|what'?s\s+my|what\s+are\s+my|"
    r"forecast|insights?|yearly|summary|afford|trend|pattern|analyze|analyse"
    r")\b",
    re.IGNORECASE,
)

_TRAILING_QUESTION_RE = re.compile(r"\?\s*$")

_LIVE_NEWS_QUERY_RE = re.compile(
    r"\b("
    r"news|headlines|headline|breaking(?:\s+news)?|current events|"
    r"in the news|what'?s new|what(?:'s| is) (?:in )?the news|"
    r"what happened today|happening (?:in the world|today)|"
    r"tell me.*\bnews\b"
    r")\b",
    re.IGNORECASE,
)

REPROMPT_SYSTEM_NOTE = build_reprompt_note()

USER_FACING_CHAT_ERROR = "Something went wrong. Please try again."

UNDO_TABLE_MAP = {
    "log_expense": "transactions",
    "log_bill": "subscriptions",
    "add_calendar_event": "events",
    "add_note": "notes",
    "log_journal_entry": "notes",
    "create_goal": "goals",
    "update_goal": "goals",
    "add_task": "action_items",
    "add_recurring_income": "recurring_income",
    "split_expense": "transactions",
}


def needs_tool_reprompt(
    user_msg: str,
    tool_calls: list,
    assistant_text: str,
    *,
    language: str = "en",
) -> bool:
    """True iff the first pass should be retried with a corrective nudge."""
    from core.intent_classifier import message_is_live_news_query, message_suggests_tool_action

    if tool_calls:
        return False
    if not user_msg or not message_suggests_tool_action(user_msg, language):
        return False
    if message_is_live_news_query(user_msg, language):
        return False
    text = (assistant_text or "").strip()
    if not text:
        return True
    last_nonempty = [ln for ln in text.splitlines() if ln.strip()]
    if last_nonempty and _TRAILING_QUESTION_RE.search(last_nonempty[-1]):
        return False
    return True
