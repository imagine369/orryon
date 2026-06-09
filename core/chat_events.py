"""
Canonical chat event shapes — shared by SSE and WebSocket transports.

Frontend: frontend/src/lib/api-chat.ts ChatEvent type must stay aligned.
"""
from __future__ import annotations

from typing import Any

CHAT_EVENT_TYPES = frozenset({
    "session",
    "token",
    "tool",
    "done",
    "error",
    "retry",
    "confirm_required",
})

# Required top-level keys per event type (contract tests enforce these).
CHAT_EVENT_CONTRACT: dict[str, frozenset[str]] = {
    "session": frozenset({"type", "session_id"}),
    "token": frozenset({"type", "content"}),
    "tool": frozenset({"type", "name", "label"}),
    "retry": frozenset({"type", "reason"}),
    "confirm_required": frozenset({"type", "action", "message"}),
    "done": frozenset({"type", "message", "actions", "tabs"}),
    "error": frozenset({"type", "message"}),
}

# Documented optional keys (not required for validation).
CHAT_EVENT_OPTIONAL_KEYS: dict[str, frozenset[str]] = {
    "confirm_required": frozenset({"args"}),
    "done": frozenset({"undo_info", "usage", "voice_overlay", "citations"}),
    "error": frozenset({"limit"}),
}


def validate_chat_event(event: dict[str, Any]) -> list[str]:
    """Return validation errors; empty list means the event matches the contract."""
    errors: list[str] = []
    event_type = event.get("type")
    if event_type not in CHAT_EVENT_TYPES:
        errors.append(f"unknown type: {event_type!r}")
        return errors

    required = CHAT_EVENT_CONTRACT[event_type]
    missing = required - set(event.keys())
    if missing:
        errors.append(f"{event_type} missing keys: {sorted(missing)}")

    if event_type == "session" and not event.get("session_id"):
        errors.append("session.session_id must be non-empty")
    if event_type == "token" and event.get("content") is None:
        errors.append("token.content must be present")
    if event_type == "error" and not str(event.get("message") or "").strip():
        errors.append("error.message must be non-empty")

    return errors


def example_events() -> list[dict[str, Any]]:
    """Reference payloads for contract tests and docs."""
    return [
        {"type": "session", "session_id": "sess-uuid"},
        {"type": "token", "content": "partial "},
        {"type": "tool", "name": "log_expense", "label": "Logging expense"},
        {"type": "retry", "reason": "no_tool_called"},
        {
            "type": "confirm_required",
            "action": "delete_expense",
            "message": "Delete this expense?",
            "args": {"expense_id": "tx-1"},
        },
        {
            "type": "done",
            "message": "Logged your coffee.",
            "actions": [{"tool": "log_expense", "args": {}, "result": {}}],
            "tabs": ["dashboard", "budget"],
            "undo_info": None,
            "usage": {"prompt_tokens": 10, "completion_tokens": 5},
        },
        {"type": "error", "message": "Orryon's AI hit a snag. Try again shortly."},
    ]
