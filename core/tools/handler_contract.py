"""Standard return shape for agent tool handlers."""
from __future__ import annotations

from typing import Callable, NotRequired, TypedDict

# Implementation functions return a plain result dict; bound handlers wrap with tabs.
ToolImpl = Callable[[dict, str], dict]


class ToolHandlerOutcome(TypedDict):
    """Every registered tool handler must return this shape."""

    result: dict
    tabs: NotRequired[list[str]]


def tool_ok(result: dict, tabs: list[str] | None = None) -> ToolHandlerOutcome:
    outcome: ToolHandlerOutcome = {"result": result}
    if tabs:
        outcome["tabs"] = tabs
    return outcome


def bind_handler(impl: ToolImpl, tabs: list[str] | None = None) -> Callable[[dict, str], ToolHandlerOutcome]:
    """Wrap an implementation so the registry dispatches a uniform {result, tabs} contract."""

    def handler(args: dict, user_id: str) -> ToolHandlerOutcome:
        return tool_ok(impl(args, user_id), tabs)

    return handler


def parse_handler_outcome(outcome: ToolHandlerOutcome | dict) -> tuple[dict, list[str]]:
    """Normalize handler return value to (result, tabs)."""
    if "result" in outcome:
        return outcome["result"], list(outcome.get("tabs") or [])
    # Legacy plain dict — should not occur for registry-bound handlers.
    return outcome, []
