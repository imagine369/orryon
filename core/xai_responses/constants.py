"""Shared constants for the xAI Responses API agent path."""

from __future__ import annotations

XAI_RESPONSES_URL = "https://api.x.ai/v1/responses"

# Raised when Responses + Agent Tools cannot run; grok_agent retries without them.
class AgentToolsUnavailable(Exception):
    """xAI Agent Tools (web_search / x_search) are not available for this request."""


_AGENT_FALLBACK_STATUSES = frozenset({400, 403, 404, 410, 422})
CHAT_MAX_OUTPUT_TOKENS = 2048

# output[].type for server-executed agent tools (show in UI while searching)
SERVER_TOOL_EVENTS: dict[str, tuple[str, str]] = {
    "web_search_call": ("web_search", "Searching the web"),
    "x_search_call": ("x_search", "Searching X"),
    "code_interpreter_call": ("code_interpreter", "Running analysis"),
}

# chunk.tool_calls[].function.name prefixes from streaming API
STREAM_SERVER_TOOL_NAMES: dict[str, str] = {
    "web_search": "Searching the web",
    "web_search_with_snippets": "Searching the web",
    "browse_page": "Browsing the web",
    "x_user_search": "Searching X",
    "x_keyword_search": "Searching X",
    "x_semantic_search": "Searching X",
    "x_thread_fetch": "Reading X thread",
}
