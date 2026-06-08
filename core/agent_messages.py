"""
Agent message assembly — system prompt context, memory, and chat history.
"""
from __future__ import annotations

from core.agent_shared import HISTORY_WINDOW


_LIFE_PRIORITY_LABELS = {
    "health": "Health & medications",
    "calendar": "Schedule",
    "communication": "Family & messages",
    "finance": "Money & bills",
    "tasks": "Tasks & reminders",
    "notes": "Notes & remembering",
}


def _life_priorities_block(ids: list[str]) -> str:
    if not ids:
        return ""
    labels = [_LIFE_PRIORITY_LABELS.get(i, i) for i in ids]
    return (
        "\n\n## USER FOCUS AREAS\n"
        f"The user asked Orryon to prioritize: {', '.join(labels)}. "
        "Weight practical help toward these when relevant. "
        "Their chat habits may shift emphasis over time.\n"
    )


def get_user_memories(user_id: str) -> list[str]:
    try:
        from db import get_user_memories
        rows = get_user_memories(user_id, limit=30)
        return [r["fact"] for r in rows]
    except Exception:
        return []


def build_messages(
    system_prompt: str,
    chat_history: list[dict],
    user_message: str,
    user_id: str,
    memories: list[str] | None = None,
    context_snip: str = "(context unavailable)",
    life_priorities: list[str] | None = None,
) -> list[dict]:
    memory_block = ""
    if memories:
        facts = "\n".join(f"- {m}" for m in memories[:30])
        memory_block = (
            "\n\n## USER MEMORY (facts you've learned about this user)\n"
            f"{facts}\n"
            "Use these to personalize responses. Don't repeat them back unless relevant."
        )

    messages: list[dict] = [
        {
            "role": "system",
            "content": (
                system_prompt
                + f"\n\n## CURRENT USER CONTEXT\n{context_snip}"
                + _life_priorities_block(life_priorities or [])
                + memory_block
            ),
        }
    ]

    recent = [m for m in chat_history if m.get("role") in ("user", "assistant")][-HISTORY_WINDOW:]
    for m in recent:
        messages.append({"role": m["role"], "content": m.get("content") or ""})

    messages.append({"role": "user", "content": user_message})
    return messages
