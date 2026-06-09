"""Instant fulfillment — deeplink handoffs (zero partner API cost in v1)."""

from core.integrations.fulfillment.handoff import (
    create_handoffs,
    dismiss_handoff,
    get_pending_handoffs,
    resolve_user_place,
)

__all__ = [
    "create_handoffs",
    "dismiss_handoff",
    "get_pending_handoffs",
    "resolve_user_place",
]
