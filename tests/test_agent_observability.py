"""Agent failure observability — Sentry tags."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

from core.agent_observability import (
    AGENT_PATH_RESPONSES,
    apply_agent_tags,
    capture_agent_failure,
    record_agent_fallback,
)


def test_apply_agent_tags_when_sentry_enabled():
    with (
        patch("core.agent_observability._sentry_enabled", return_value=True),
        patch("sentry_sdk.set_tag") as set_tag,
    ):
        apply_agent_tags(
            agent_path=AGENT_PATH_RESPONSES,
            tool_name="log_expense",
            reprompt=True,
            round_count=2,
        )
    set_tag.assert_any_call("agent_path", AGENT_PATH_RESPONSES)
    set_tag.assert_any_call("tool_name", "log_expense")
    set_tag.assert_any_call("reprompt", "true")
    set_tag.assert_any_call("round_count", "2")


def test_capture_agent_failure_with_exception():
    err = RuntimeError("boom")
    with (
        patch("core.agent_observability._sentry_enabled", return_value=True),
        patch("sentry_sdk.capture_exception") as capture_exception,
        patch("sentry_sdk.set_tag"),
    ):
        capture_agent_failure(
            err,
            agent_path=AGENT_PATH_RESPONSES,
            tool_name="get_balance",
            reprompt=False,
            round_count=1,
            message="test",
        )
    capture_exception.assert_called_once_with(err)


def test_record_agent_fallback_breadcrumb():
    with (
        patch("core.agent_observability._sentry_enabled", return_value=True),
        patch("sentry_sdk.add_breadcrumb") as add_breadcrumb,
        patch("sentry_sdk.set_tag"),
    ):
        record_agent_fallback(
            from_path="responses",
            to_path="responses_degraded",
            reason="agent_tools_unavailable",
        )
    add_breadcrumb.assert_called_once()
