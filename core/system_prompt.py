"""
core/system_prompt.py — Master system prompt for Orryon AI (v10, Life OS).

Every tool name in this prompt MUST exist in core.tools.registry.TOOL_SPECS / CANONICAL_TOOL_NAMES.
Memory is injected automatically (see grok_agent) — there are no save_memory tools.
Capability policy: docs/CAPABILITIES.md
"""

from datetime import datetime

from core.canonical_tools import CANONICAL_TOOL_NAMES
from core.system_prompt_template import build_system_prompt_body

# Health disclaimer — append on every health/medical turn (liability).
HEALTH_MEDICAL_DISCLAIMER = (
    "I'm not a medical professional, and this isn't a substitute for professional "
    "medical advice, diagnosis, or treatment. Please consult a qualified healthcare "
    "provider for any decisions about your health."
)

HEALTH_MEDICAL_DISCLAIMER_VOICE = (
    "Just so you know — I'm not a doctor; please check with a healthcare professional "
    "for medical decisions."
)


def get_system_prompt(
    user_name: str = "there",
    mode: str = "adult",          # "adult" | "golden"
    tier: str = "pro",            # "starter" | "pro" | "premium"
    voice_enabled: bool = False,
    locale_block: str = "",
) -> str:
    now = datetime.now()
    today_str = now.strftime("%A, %B %d, %Y")
    today_iso = now.strftime("%Y-%m-%d")
    year = now.year
    current_month = now.strftime("%Y-%m")
    is_golden = mode == "golden"
    has_voice = voice_enabled and tier == "premium_plus"

    personality_block = _golden_personality(user_name) if is_golden else _adult_personality(user_name)
    voice_note = (
        "\nVOICE MODE ON — Speak naturally: contractions, warmth, no markdown, no lists. "
        "Keep turns to 1–3 sentences unless asked for more. "
        "When using a tool, narrate it in one spoken phrase.\n"
        if has_voice else ""
    )
    golden_mode_format_block = (
        "GOLDEN MODE FORMAT:\n  • Shorter sentences. Simpler words. Warmer tone.\n"
        "  • Celebrate small wins. Never use jargon.\n"
        if is_golden
        else ""
    )
    health_disclaimer = (
        HEALTH_MEDICAL_DISCLAIMER_VOICE if has_voice else HEALTH_MEDICAL_DISCLAIMER
    )

    tool_list = ", ".join(CANONICAL_TOOL_NAMES)
    locale_section = f"\n{locale_block}\n" if locale_block else ""

    return build_system_prompt_body(
        personality_block=personality_block,
        today_str=today_str,
        today_iso=today_iso,
        current_month=current_month,
        year=year,
        user_name=user_name,
        tier=tier,
        is_golden=is_golden,
        voice_note=voice_note,
        locale_section=locale_section,
        health_disclaimer=health_disclaimer,
        tool_list=tool_list,
        golden_mode_format_block=golden_mode_format_block,
    )


def _adult_personality(user_name: str) -> str:
    return (
        "a calm, highly capable Life OS — almost anything in chat, "
        "and real actions on their money, schedule, and logs via tools. Warm and proactive; "
        "not a code IDE, image generator, or explicit-content site."
    )


def _golden_personality(user_name: str) -> str:
    return (
        "a gentle, patient Life OS companion — warm chat on almost any topic, and real help "
        "with money and schedule via tools, at a comfortable pace."
    )
