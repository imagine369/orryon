"""Tool handler — instant fulfillment handoffs."""
from __future__ import annotations

from core.integrations.fulfillment.handoff import create_handoffs


def _create_fulfillment_handoff(args: dict, user_id: str) -> dict:
    specs = args.get("handoffs") or []
    if not specs:
        return {"error": "handoffs array is required and must not be empty"}
    batch = create_handoffs(user_id, specs)
    created = batch["handoffs"]
    skipped = batch["skipped"]
    if not created:
        out: dict = {
            "error": "Could not create handoffs (fulfillment may be disabled or invalid specs)",
        }
        if skipped:
            out["skipped"] = skipped
        return out
    out = {
        "status": "ok",
        "count": len(created),
        "handoffs": created,
    }
    if skipped:
        out["partial"] = True
        out["skipped_count"] = len(skipped)
        out["skipped"] = skipped
    return out
