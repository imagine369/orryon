"""HTTP error mapping for the Responses API."""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def responses_error_message(status: int, body: str) -> str:
    if status == 401:
        return "Invalid API key. Check `XAI_API_KEY` in your `.env` file."
    if status == 429:
        return "I'm getting a lot of requests right now. Give me a sec and try again."
    if status >= 500:
        return "Orryon's AI is temporarily unavailable. Try again in a few seconds."
    if status in (400, 403, 404, 422):
        logger.warning("xAI Responses API %s: %s", status, body[:500])
        return ""
    return "Orryon's AI hit a snag. Try again shortly."
