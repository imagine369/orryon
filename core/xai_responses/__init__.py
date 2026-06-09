"""
core/xai_responses — xAI Responses API with Agent Tools (web_search, x_search).

Server-side browsing/search (web_search, x_search) like the Grok app,
mixed with Orryon's client-side Life OS function tools.
"""

from __future__ import annotations

from core.xai_responses.agent import run_orryon_stream_agent
from core.xai_responses.constants import AgentToolsUnavailable
from core.xai_responses.stream import stream_responses as _stream_responses
from core.xai_responses.tools import chat_schemas_to_responses_tools, split_instructions_and_input

__all__ = [
    "AgentToolsUnavailable",
    "chat_schemas_to_responses_tools",
    "run_orryon_stream_agent",
    "split_instructions_and_input",
    "_stream_responses",
]
