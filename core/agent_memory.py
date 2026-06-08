"""
Background memory extraction after assistant turns.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re

from core.agent_messages import get_user_memories
from core.xai_client import call_grok_async, has_api_keys

logger = logging.getLogger(__name__)


def schedule_memory_extraction(
    user_message: str,
    assistant_response: str,
    user_id: str,
) -> None:
    if not has_api_keys() or len(user_message) < 15:
        return
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(
            extract_memories_async(user_message, assistant_response, user_id)
        )
    except RuntimeError:
        pass


async def extract_memories_async(
    user_message: str,
    assistant_response: str,
    user_id: str,
) -> None:
    try:
        from core.plans import (
            get_monthly_spend_cap,
            get_monthly_token_cap,
            resolve_plan_for_user_id,
        )
        from db import get_monthly_spend, get_monthly_token_usage, record_token_spend, save_user_memory

        plan_info = resolve_plan_for_user_id(user_id)
        if not plan_info:
            return
        plan = plan_info["plan"]
        if get_monthly_spend(user_id) >= get_monthly_spend_cap(plan):
            return
        token_usage = get_monthly_token_usage(user_id)
        if token_usage["total_tokens"] >= get_monthly_token_cap(plan):
            return

        existing = get_user_memories(user_id)
        if len(existing) > 100:
            return

        result = await call_grok_async([
            {
                "role": "system",
                "content": (
                    "Extract notable personal facts from this conversation that would be useful "
                    "to remember for future interactions. Only extract CONCRETE facts like: "
                    "preferences, life circumstances, financial details, names of people/pets, "
                    "habits, or goals. Return a JSON array of strings. If nothing notable, return []. "
                    "Max 3 facts per exchange. Be concise (under 15 words each)."
                ),
            },
            {
                "role": "user",
                "content": f"User said: {user_message}\nAssistant responded: {assistant_response[:500]}",
            },
        ])

        usage = result.get("usage") or {}
        pt = int(usage.get("prompt_tokens") or 0)
        ct = int(usage.get("completion_tokens") or 0)
        if pt or ct:
            record_token_spend(user_id, pt, ct)

        content = result["choices"][0]["message"]["content"].strip()
        facts = _parse_json_array(content)

        for fact in facts[:3]:
            if isinstance(fact, str) and len(fact.strip()) > 5:
                save_user_memory(user_id, fact.strip())

    except Exception as exc:
        logger.debug("Memory extraction failed (non-critical): %s", exc)


def _parse_json_array(text: str) -> list:
    text = text.strip()
    if text.startswith("["):
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass
    match = re.search(r"\[.*\]", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return []
