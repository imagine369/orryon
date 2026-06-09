"""
Session summarization — compress older chat turns when history exceeds the window.
"""
from __future__ import annotations

import asyncio
import logging

from core.agent_shared import HISTORY_WINDOW
from core.memory_constants import SESSION_SUMMARY_REFRESH_EVERY
from core.xai_client import call_grok_async, has_api_keys

logger = logging.getLogger(__name__)


def conversation_turns(chat_history: list[dict]) -> list[dict]:
    return [m for m in chat_history if m.get("role") in ("user", "assistant")]


def split_history(turns: list[dict]) -> tuple[list[dict], list[dict]]:
    if len(turns) <= HISTORY_WINDOW:
        return [], turns
    return turns[:-HISTORY_WINDOW], turns[-HISTORY_WINDOW:]


def cheap_rollup(older_turns: list[dict], max_chars: int = 2000) -> str:
    """Non-LLM fallback until async summary is ready."""
    bullets: list[str] = []
    for msg in older_turns:
        role = msg.get("role", "user")
        text = (msg.get("content") or "").strip().replace("\n", " ")[:240]
        if text:
            bullets.append(f"- ({role}) {text}")
    body = "\n".join(bullets)
    return body[:max_chars] if body else ""


def build_summary_system_block(summary: str) -> str:
    if not summary.strip():
        return ""
    return (
        "\n\n## EARLIER IN THIS CONVERSATION\n"
        f"{summary.strip()}\n"
        "Use this for continuity. Focus on the recent messages below for the latest intent."
    )


def resolve_session_summary(turns: list[dict], cached_summary: str) -> str:
    older, _recent = split_history(turns)
    if not older:
        return ""
    if cached_summary.strip():
        return cached_summary.strip()
    return cheap_rollup(older)


def should_refresh_summary(total_turns: int, summarized_through: int) -> bool:
    if total_turns <= HISTORY_WINDOW:
        return False
    if summarized_through <= 0:
        return True
    return (total_turns - summarized_through) >= SESSION_SUMMARY_REFRESH_EVERY


def schedule_session_summary(
    user_id: str,
    session_id: str,
    chat_history: list[dict],
) -> None:
    if not session_id or not has_api_keys():
        return
    turns = conversation_turns(chat_history)
    if len(turns) <= HISTORY_WINDOW:
        return
    try:
        from db.chat import get_session_summary_meta

        meta = get_session_summary_meta(session_id)
        summarized_through = int(meta.get("summary_message_count") or 0)
        if not should_refresh_summary(len(turns), summarized_through):
            return
        loop = asyncio.get_running_loop()
        loop.create_task(
            summarize_session_async(
                user_id,
                session_id,
                turns,
                existing_summary=meta.get("summary") or "",
            )
        )
    except RuntimeError:
        pass


async def summarize_session_async(
    user_id: str,
    session_id: str,
    turns: list[dict],
    *,
    existing_summary: str = "",
) -> None:
    try:
        from core.plans import (
            get_monthly_spend_cap,
            get_monthly_token_cap,
            resolve_plan_for_user_id,
        )
        from db.chat import update_session_summary
        from db.usage import (
            get_monthly_spend,
            get_monthly_token_usage,
            record_token_spend,
        )

        if not resolve_plan_for_user_id(user_id):
            return
        plan = resolve_plan_for_user_id(user_id)["plan"]
        if get_monthly_spend(user_id) >= get_monthly_spend_cap(plan):
            return
        if get_monthly_token_usage(user_id)["total_tokens"] >= get_monthly_token_cap(plan):
            return

        older, _recent = split_history(turns)
        if not older:
            return

        transcript_lines: list[str] = []
        for msg in older[-40:]:
            role = msg.get("role", "user")
            text = (msg.get("content") or "").strip()[:600]
            if text:
                transcript_lines.append(f"{role.upper()}: {text}")
        transcript = "\n".join(transcript_lines)
        if not transcript:
            return

        prior = (
            f"\nExisting summary to merge/update:\n{existing_summary}\n"
            if existing_summary.strip()
            else ""
        )
        result = await call_grok_async([
            {
                "role": "system",
                "content": (
                    "Summarize the earlier part of a chat between a user and Orryon "
                    "(a life OS assistant). Capture: topics discussed, decisions made, "
                    "data logged, open questions, and user preferences mentioned. "
                    "Be concise (under 350 words). Plain prose, no bullet lists unless "
                    "listing specific amounts or dates."
                ),
            },
            {
                "role": "user",
                "content": f"{prior}\nNew transcript to incorporate:\n{transcript}",
            },
        ])

        usage = result.get("usage") or {}
        pt = int(usage.get("prompt_tokens") or 0)
        ct = int(usage.get("completion_tokens") or 0)
        if pt or ct:
            record_token_spend(user_id, pt, ct)

        summary = (result["choices"][0]["message"]["content"] or "").strip()
        if not summary:
            return

        # Total turns covered by this summary (used for every-N refresh gating).
        update_session_summary(session_id, summary, len(turns))
    except Exception as exc:
        logger.debug("Session summarization failed (non-critical): %s", exc)
