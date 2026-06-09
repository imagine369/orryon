"""Grok agent — message assembly, re-prompt, tool rounds, memory extraction."""
from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from core.agent_messages import build_messages
from core.agent_memory import extract_memories_async
from core.agent_shared import needs_tool_reprompt
from core.xai_responses import run_orryon_stream_agent, split_instructions_and_input
from db.auth import get_or_create_user_by_email


def test_build_messages_includes_context_memory_and_history():
    system = "You are Orryon."
    history = [
        {"role": "user", "content": "older turn"},
        {"role": "assistant", "content": "older reply"},
    ]
    messages = build_messages(
        system,
        history,
        "log coffee $5",
        "user-1",
        memories=["Prefers oat milk"],
        context_snip="Balance: $100",
        life_priorities=["finance"],
        cached_session_summary="User asked about budget yesterday.",
    )

    assert messages[0]["role"] == "system"
    system_text = messages[0]["content"]
    assert "Balance: $100" in system_text
    assert "Prefers oat milk" in system_text
    assert "USER FOCUS AREAS" in system_text
    assert "finance" in system_text.lower() or "Money" in system_text
    assert messages[-1] == {"role": "user", "content": "log coffee $5"}
    assert any(m["role"] == "user" and m["content"] == "older turn" for m in messages[1:-1])


def test_split_instructions_and_input():
    messages = [
        {"role": "system", "content": "sys block"},
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": "hello"},
        {"role": "user", "content": "again"},
    ]
    instructions, items = split_instructions_and_input(messages)
    assert instructions == "sys block"
    assert items == [
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": "hello"},
        {"role": "user", "content": "again"},
    ]


def test_needs_tool_reprompt_triggers_on_action_without_tools():
    assert needs_tool_reprompt(
        "log my coffee expense $5",
        [],
        "Got it!",
        language="en",
    )


def test_needs_tool_reprompt_skips_greeting_and_clarifying_question():
    assert not needs_tool_reprompt("hello there", [], "Hi!", language="en")
    assert not needs_tool_reprompt(
        "log expense",
        [],
        "How much did you spend?",
        language="en",
    )


@pytest.mark.asyncio
async def test_run_orryon_stream_agent_reprompt_then_done():
    user = get_or_create_user_by_email("pytest-grok-reprompt@orryon.app")
    calls = {"n": 0}

    async def fake_stream(**_kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            yield {"kind": "token", "content": "Sure."}
            yield {
                "kind": "completed",
                "response": {
                    "id": "resp-1",
                    "output": [{
                        "type": "message",
                        "content": [{"type": "output_text", "text": "Sure."}],
                    }],
                },
            }
        else:
            yield {
                "kind": "completed",
                "response": {
                    "id": "resp-2",
                    "output": [{
                        "type": "message",
                        "content": [{"type": "output_text", "text": "Logged."}],
                    }],
                },
            }

    messages = build_messages("sys", [], "log my coffee $5", user["id"])
    events = []
    with patch("core.xai_responses._stream_responses", side_effect=fake_stream):
        async for ev in run_orryon_stream_agent(
            user_message="log my coffee $5",
            user_id=user["id"],
            messages=messages,
            responses_tools=[],
            api_key="test-key",
            reprompt_note="SYSTEM CORRECTION: call a tool.",
        ):
            events.append(ev)

    types = [e["type"] for e in events]
    assert "retry" in types
    assert types.index("retry") < types.index("done")
    assert events[types.index("retry")]["reason"] == "no_tool_called"


@pytest.mark.asyncio
async def test_run_orryon_stream_agent_tool_round_mock_xai():
    user = get_or_create_user_by_email("pytest-grok-tool-round@orryon.app")
    calls = {"n": 0}

    async def fake_stream(**_kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            yield {
                "kind": "completed",
                "response": {
                    "id": "resp-1",
                    "output": [{
                        "type": "function_call",
                        "call_id": "call-1",
                        "name": "log_expense",
                        "arguments": json.dumps({
                            "amount": 5.5,
                            "merchant": "Grok Cafe",
                            "category": "Food & Dining",
                            "date": "2026-06-01",
                        }),
                    }],
                },
            }
        else:
            yield {
                "kind": "completed",
                "response": {
                    "id": "resp-2",
                    "output": [{
                        "type": "message",
                        "content": [{"type": "output_text", "text": "Logged your coffee."}],
                    }],
                },
            }

    messages = build_messages("sys", [], "log coffee $5.50", user["id"])
    events = []
    with patch("core.xai_responses._stream_responses", side_effect=fake_stream):
        async for ev in run_orryon_stream_agent(
            user_message="log coffee $5.50",
            user_id=user["id"],
            messages=messages,
            responses_tools=[{"type": "function", "name": "log_expense"}],
            api_key="test-key",
            reprompt_note="nudge",
        ):
            events.append(ev)

    types = [e["type"] for e in events]
    assert types.count("tool") >= 1
    assert events[types.index("tool")]["name"] == "log_expense"
    assert "done" in types
    done = next(e for e in events if e["type"] == "done")
    assert done["message"]
    assert any(a.get("tool") == "log_expense" for a in done.get("actions") or [])


@pytest.mark.asyncio
async def test_extract_memories_async_mock_llm():
    user = get_or_create_user_by_email("pytest-grok-memory@orryon.app")
    mock_grok = AsyncMock(return_value={
        "choices": [{"message": {"content": '["Drinks oat milk daily", "Dog named Max"]'}}],
        "usage": {"prompt_tokens": 10, "completion_tokens": 5},
    })
    plan = MagicMock()
    plan_info = {"plan": plan}

    with (
        patch("core.agent_memory.has_api_keys", return_value=True),
        patch("core.agent_memory.call_grok_async", mock_grok),
        patch("core.plans.resolve_plan_for_user_id", return_value=plan_info),
        patch("core.plans.get_monthly_spend_cap", return_value=999),
        patch("core.plans.get_monthly_token_cap", return_value=999_999),
        patch("db.usage.get_monthly_spend", return_value=0),
        patch("db.usage.get_monthly_token_usage", return_value={"total_tokens": 0}),
        patch("db.usage.record_token_spend") as record_spend,
        patch("db.memory.count_user_memory", return_value=0),
        patch("db.memory.save_user_memory") as save_memory,
    ):
        await extract_memories_async(
            "I drink oat milk every morning and my dog Max loves walks",
            "Noted your preferences!",
            user["id"],
        )

    mock_grok.assert_awaited_once()
    assert save_memory.call_count >= 1
    record_spend.assert_called_once()
