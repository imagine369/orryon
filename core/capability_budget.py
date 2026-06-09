"""
Product capability budgets — strategic limits on agent surface area.

New canonical tools or prompt growth must trade against these caps or raise them
deliberately in code review. See docs/PRODUCT_BOUNDARY.md.
"""
from __future__ import annotations

from pathlib import Path

# Headroom above current 68 tools; raise only with product review.
MAX_CANONICAL_TOOLS = 72

# system_prompt.py is injected every chat turn; keep it bounded.
MAX_SYSTEM_PROMPT_LINES = 300

_SYSTEM_PROMPT_PATH = Path(__file__).resolve().parent / "system_prompt.py"


def validate_capability_budget() -> None:
    from core.canonical_tools import CANONICAL_TOOL_NAMES

    n_tools = len(CANONICAL_TOOL_NAMES)
    if n_tools > MAX_CANONICAL_TOOLS:
        raise RuntimeError(
            f"Canonical tool budget exceeded: {n_tools} > {MAX_CANONICAL_TOOLS}. "
            "Remove or merge a tool before adding, or raise MAX_CANONICAL_TOOLS with review."
        )

    lines = sum(1 for _ in _SYSTEM_PROMPT_PATH.open(encoding="utf-8"))
    if lines > MAX_SYSTEM_PROMPT_LINES:
        raise RuntimeError(
            f"system_prompt.py over budget: {lines} > {MAX_SYSTEM_PROMPT_LINES} lines. "
            "Move prose to docs/CAPABILITIES.md or raise MAX_SYSTEM_PROMPT_LINES with review."
        )
