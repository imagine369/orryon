"""Capabilities policy stays aligned with the live system prompt."""
from __future__ import annotations

import re
from pathlib import Path

from core.canonical_tools import CANONICAL_TOOL_NAMES, _REPROMPT_SECTIONS
from core.system_prompt import get_system_prompt

_CAPABILITIES_PATH = Path(__file__).resolve().parents[1] / "docs" / "CAPABILITIES.md"


def test_system_prompt_lists_every_canonical_tool():
    prompt = get_system_prompt()
    missing = [name for name in CANONICAL_TOOL_NAMES if name not in prompt]
    assert not missing, f"canonical tools missing from system prompt: {missing}"


def test_reprompt_sections_cover_canonical_tools():
    listed: set[str] = set()
    for section in _REPROMPT_SECTIONS:
        for name in re.findall(r"[a-z][a-z0-9_]*", section):
            if name in CANONICAL_TOOL_NAMES:
                listed.add(name)
    missing = sorted(set(CANONICAL_TOOL_NAMES) - listed)
    assert not missing, f"canonical tools missing from _REPROMPT_SECTIONS: {missing}"


def test_capabilities_doc_references_system_prompt():
    text = _CAPABILITIES_PATH.read_text()
    assert "core/system_prompt.py" in text
    assert "CANONICAL_TOOL_NAMES" in text or str(len(CANONICAL_TOOL_NAMES)) in text
