"""Strategic capability budgets — tools and system prompt size."""
from __future__ import annotations

from core.capability_budget import (
    MAX_CANONICAL_TOOLS,
    MAX_SYSTEM_PROMPT_LINES,
    validate_capability_budget,
)
from core.canonical_tools import CANONICAL_TOOL_NAMES


def test_capability_budget_within_limits():
    validate_capability_budget()


def test_canonical_tool_headroom_documented():
    n = len(CANONICAL_TOOL_NAMES)
    assert n <= MAX_CANONICAL_TOOLS
    assert MAX_CANONICAL_TOOLS - n >= 1, "budget should leave headroom for at least one tool"
