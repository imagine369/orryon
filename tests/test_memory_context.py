"""Memory dedup, pruning, and session summary helpers."""
from __future__ import annotations

import uuid

import pytest

from core.agent_messages import build_messages
from core.memory_constants import MEMORY_CAP, MEMORY_FUZZY_THRESHOLD
from core.memory_dedup import find_similar_fact, is_duplicate_fact, similarity
from core.session_summary import (
    build_summary_system_block,
    cheap_rollup,
    resolve_session_summary,
    should_refresh_summary,
    split_history,
)
from db.auth import get_or_create_user_by_email
from db.memory import (
    count_user_memory,
    prune_user_memory,
    save_user_memory,
)


@pytest.fixture
def user_id():
    email = f"pytest-memory-{uuid.uuid4().hex[:10]}@orryon.app"
    return get_or_create_user_by_email(email)["id"]


def test_similarity_detects_near_duplicates():
    assert similarity("User has a dog named Max", "Has a dog named Max") >= MEMORY_FUZZY_THRESHOLD
    assert not is_duplicate_fact("Likes hiking", "Prefers Italian food")


def test_find_similar_fact_returns_row():
    rows = [
        {"id": "1", "fact": "User has a dog named Max"},
        {"id": "2", "fact": "Works remotely"},
    ]
    match = find_similar_fact("Has a dog named Max", rows)
    assert match is not None
    assert match["id"] == "1"


def test_save_user_memory_skips_fuzzy_duplicate(user_id):
    save_user_memory(user_id, "User drinks coffee every morning")
    before = count_user_memory(user_id)
    save_user_memory(user_id, "Drinks coffee every morning")
    after = count_user_memory(user_id)
    assert after == before


def test_save_user_memory_prunes_at_cap(user_id):
    for i in range(MEMORY_CAP + 5):
        save_user_memory(user_id, f"Unique pytest memory fact number {i:03d} alpha")
    assert count_user_memory(user_id) <= MEMORY_CAP


def test_prune_user_memory_drops_oldest(user_id):
    save_user_memory(user_id, "Oldest prune candidate alpha one")
    save_user_memory(user_id, "Newer prune candidate beta two")
    removed = prune_user_memory(user_id, keep=1)
    assert removed >= 1
    assert count_user_memory(user_id) == 1


def test_split_history_keeps_recent_window():
    turns = [{"role": "user", "content": f"m{i}"} for i in range(25)]
    older, recent = split_history(turns)
    assert len(recent) == 20
    assert len(older) == 5


def test_resolve_session_summary_uses_cache():
    turns = [{"role": "user", "content": f"m{i}"} for i in range(25)]
    text = resolve_session_summary(turns, "Cached summary body")
    assert text == "Cached summary body"


def test_resolve_session_summary_rollup_without_cache():
    turns = [{"role": "user", "content": "budget question"} for _ in range(25)]
    text = resolve_session_summary(turns, "")
    assert "budget question" in text


def test_should_refresh_summary():
    assert not should_refresh_summary(15, 0)
    assert should_refresh_summary(25, 0)
    assert not should_refresh_summary(25, 20)
    assert should_refresh_summary(31, 20)


def test_summary_refresh_not_every_turn_after_first_summary():
    """summary_message_count must be total turns, not len(older), or refresh fires every turn."""
    # 25 turns: first summary stores count=25; next turn should not re-summarize.
    assert not should_refresh_summary(26, 25)
    assert should_refresh_summary(35, 25)


def test_build_messages_includes_session_summary_block():
    history = [{"role": "user", "content": f"msg {i}"} for i in range(22)]
    messages = build_messages(
        "sys",
        history,
        "latest",
        "user-1",
        memories=[],
        context_snip="ctx",
        cached_session_summary="Discussed groceries and budget.",
    )
    system = messages[0]["content"]
    assert "## EARLIER IN THIS CONVERSATION" in system
    assert "groceries and budget" in system
    assert len([m for m in messages if m["role"] == "user"]) == 21  # 20 history + current


def test_build_summary_system_block_empty():
    assert build_summary_system_block("") == ""
