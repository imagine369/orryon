"""
Sentry tags for agent failures — makes path, tool, and re-prompt visible in production.

Tags: agent_path, tool_name, reprompt, round_count
See docs/PRODUCT_BOUNDARY.md § Agent runtime.
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

# Chat: xAI Responses (full or degraded). Background LLM: completions only.
AGENT_PATH_RESPONSES = "responses"
AGENT_PATH_RESPONSES_DEGRADED = "responses_degraded"
AGENT_PATH_COMPLETIONS = "completions"


def _sentry_enabled() -> bool:
    try:
        import sentry_sdk
    except ImportError:
        return False
    client = sentry_sdk.get_client()
    return client is not None and client.dsn is not None


def apply_agent_tags(
    *,
    agent_path: str,
    tool_name: str | None = None,
    reprompt: bool = False,
    round_count: int = 0,
) -> None:
    if not _sentry_enabled():
        return
    import sentry_sdk

    sentry_sdk.set_tag("agent_path", agent_path)
    sentry_sdk.set_tag("tool_name", tool_name or "")
    sentry_sdk.set_tag("reprompt", "true" if reprompt else "false")
    sentry_sdk.set_tag("round_count", str(round_count))


def capture_agent_failure(
    exc: BaseException | None,
    *,
    agent_path: str,
    tool_name: str | None = None,
    reprompt: bool = False,
    round_count: int = 0,
    message: str = "agent failure",
    level: str = "error",
) -> None:
    """Record an agent failure with standard tags (exception or message)."""
    apply_agent_tags(
        agent_path=agent_path,
        tool_name=tool_name,
        reprompt=reprompt,
        round_count=round_count,
    )
    logger.error(
        "agent failure path=%s tool=%s reprompt=%s round=%s msg=%s",
        agent_path,
        tool_name,
        reprompt,
        round_count,
        message,
        exc_info=exc,
    )
    if not _sentry_enabled():
        return
    import sentry_sdk

    if exc is not None:
        sentry_sdk.capture_exception(exc)
    else:
        sentry_sdk.capture_message(message, level=level)


def record_agent_fallback(
    *,
    from_path: str,
    to_path: str,
    reason: str,
) -> None:
    """Visible breadcrumb when chat degrades (not a user-facing error)."""
    apply_agent_tags(agent_path=from_path, round_count=0)
    logger.warning("agent fallback %s → %s: %s", from_path, to_path, reason)
    if not _sentry_enabled():
        return
    import sentry_sdk

    sentry_sdk.add_breadcrumb(
        category="agent",
        message=f"fallback {from_path} → {to_path}",
        data={"reason": reason},
        level="warning",
    )
