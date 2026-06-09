"""Fuzzy deduplication for user memory facts."""
from __future__ import annotations

import re
from difflib import SequenceMatcher

from core.memory_constants import MEMORY_FUZZY_THRESHOLD

_NON_WORD_RE = re.compile(r"[^\w\s]")
_SPACE_RE = re.compile(r"\s+")


def normalize_fact(text: str) -> str:
    t = _NON_WORD_RE.sub(" ", text.lower().strip())
    return _SPACE_RE.sub(" ", t).strip()


def similarity(a: str, b: str) -> float:
    na, nb = normalize_fact(a), normalize_fact(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0
    if na in nb or nb in na:
        return 0.95
    return SequenceMatcher(None, na, nb).ratio()


def is_duplicate_fact(
    new_fact: str,
    existing_fact: str,
    *,
    threshold: float = MEMORY_FUZZY_THRESHOLD,
) -> bool:
    return similarity(new_fact, existing_fact) >= threshold


def find_similar_fact(new_fact: str, existing_rows: list[dict]) -> dict | None:
    """Return the best-matching existing memory row, if any."""
    best: dict | None = None
    best_score = 0.0
    for row in existing_rows:
        score = similarity(new_fact, row.get("fact") or "")
        if score >= MEMORY_FUZZY_THRESHOLD and score > best_score:
            best = row
            best_score = score
    return best
