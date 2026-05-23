"""Brand spelling for the assistant — always orryon, not homophones."""
from __future__ import annotations

import re

# User addressing the product (voice/STT often hears Oriana, Orion, etc.)
_ADDRESSING_RE = re.compile(
    r"\b(Oriana|Oriona|Oryan|Orryon|ORRYON|ORION|Orion)\b",
    re.IGNORECASE,
)

# Orion the constellation / astronomy — keep capital Orion in replies
_ASTRONOMY_CONTEXT_RE = re.compile(
    r"\b("
    r"constellation|constellations|star[s]?|stellar|astronomy|astrophysics|"
    r"nebula|nebular|m42|rigel|betelgeuse|celestial|night\s+sky|"
    r"orion\s+nebula|belt\s+of\s+orion|orion\s+constellation"
    r")\b",
    re.IGNORECASE,
)

_REPLY_FIXES: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\bOriana\b", re.IGNORECASE), "orryon"),
    (re.compile(r"\bOriona\b", re.IGNORECASE), "orryon"),
    (re.compile(r"\bOryan\b", re.IGNORECASE), "orryon"),
    (re.compile(r"\bOrryon\b"), "orryon"),
    (re.compile(r"\bORRYON\b"), "orryon"),
)


def user_asks_orion_astronomy(text: str) -> bool:
    """True when the user is asking about Orion the constellation, not the product."""
    if not text or not re.search(r"\borion\b", text, re.IGNORECASE):
        return False
    if _ASTRONOMY_CONTEXT_RE.search(text):
        return True
    # "Orion star system" / explicit space phrasing
    if re.search(r"\borion\s+(star|constellation|belt|nebula|system)\b", text, re.IGNORECASE):
        return True
    return False


def user_likely_addressing_orryon(text: str) -> bool:
    if not text:
        return False
    if user_asks_orion_astronomy(text):
        return False
    return bool(_ADDRESSING_RE.search(text))


def normalize_orryon_in_assistant_reply(reply: str, user_message: str = "") -> str:
    """Fix homophone spellings in assistant output; preserve Orion for astronomy."""
    if not reply:
        return reply
    if user_asks_orion_astronomy(user_message) or user_asks_orion_astronomy(reply):
        return reply
    out = reply
    for pattern, replacement in _REPLY_FIXES:
        out = pattern.sub(replacement, out)
    # Orion → orryon only when clearly meaning the product (e.g. "Hi Orion" at start)
    if not _ASTRONOMY_CONTEXT_RE.search(out):
        out = re.sub(r"\bOrion\b", "orryon", out)
        out = re.sub(r"\bORION\b", "orryon", out)
    return out
