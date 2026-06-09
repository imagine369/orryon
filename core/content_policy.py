"""
Server-side content policy — mirrors the three chat limits in system_prompt.py.

Prompt-only guardrails are not sufficient for production; chat routes call this
before invoking the LLM.
"""
from __future__ import annotations

import re

# Hard block — aligns with ## NEVER in system_prompt.py
_PORN_RE = re.compile(
    r"\b("
    r"porn|pornograph|xxx|hentai|nsfw|onlyfans|"
    r"sexual roleplay|erotic fiction|nude pic|nudes|"
    r"send me nudes|explicit sex"
    r")\b",
    re.IGNORECASE,
)

_MINOR_SEXUAL_RE = re.compile(
    r"\b(child|minor|underage|teen).{0,30}\b(sex|nude|porn)",
    re.IGNORECASE | re.DOTALL,
)

# Substantial code / repo work — not one-line life help
_CODE_PROJECT_RE = re.compile(
    r"\b("
    r"write\s+(me\s+)?(a\s+)?(full\s+)?(react|next\.?js|vue|angular|django|flask|fastapi|"
    r"express|node|python|golang|rust|java)\s+(app|application|project|api|backend|frontend)|"
    r"build\s+(me\s+)?(a\s+)?(complete|full)\s+(app|website|saas|api)|"
    r"debug\s+(this|my)\s+(entire|whole)\s+(codebase|repository|project)|"
    r"complete\s+(my\s+)?(programming\s+)?homework|"
    r"implement\s+(a\s+)?multi[- ]file"
    r")\b",
    re.IGNORECASE,
)

_FENCED_CODE_RE = re.compile(r"```[\s\S]{400,}```")

# Image generation / editing as a product feature
_IMAGE_GEN_RE = re.compile(
    r"\b("
    r"generate\s+(an?\s+)?(image|picture|photo|logo|illustration|artwork)|"
    r"create\s+(an?\s+)?(ai\s+)?(image|picture|logo)|"
    r"make\s+(me\s+)?(a\s+)?(logo|picture|image|portrait)|"
    r"edit\s+(this|my)\s+photo|remove\s+background\s+from|"
    r"stable\s+diffusion|midjourney|dall[- ]?e"
    r")\b",
    re.IGNORECASE,
)

REFUSAL_PORN = (
    "I can't help with explicit sexual content. Orryon is a Life OS assistant — "
    "I'm happy to help with your schedule, money, notes, or other life admin."
)
REFUSAL_CODE = (
    "I can't write or debug substantial software projects here. Orryon focuses on "
    "your life data and day-to-day help. For coding, use a dedicated development tool."
)
REFUSAL_IMAGE = (
    "I can't generate or edit images in chat. Orryon is text-only — try a dedicated "
    "image tool if you need logos or artwork."
)


def evaluate_content_policy(message: str) -> str | None:
    """
    Return a user-facing refusal string if the message violates policy, else None.
    """
    text = (message or "").strip()
    if not text:
        return None
    if _PORN_RE.search(text) or _MINOR_SEXUAL_RE.search(text):
        return REFUSAL_PORN
    if _IMAGE_GEN_RE.search(text):
        return REFUSAL_IMAGE
    if _CODE_PROJECT_RE.search(text) or _FENCED_CODE_RE.search(text):
        return REFUSAL_CODE
    return None
