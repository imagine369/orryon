"""Shared limits for user memory and session context."""

from __future__ import annotations

# Long-term facts stored per user (prune beyond this).
MEMORY_CAP = 100

# Facts injected into the system prompt each turn.
MEMORY_PROMPT_LIMIT = 30

# Fuzzy duplicate threshold for save_user_memory (0–1).
MEMORY_FUZZY_THRESHOLD = 0.85

# Recent turns sent verbatim to the LLM (see agent_shared.HISTORY_WINDOW).
# Session summary covers everything before the window when count exceeds this.

# Re-summarize older turns after this many new messages since last summary.
SESSION_SUMMARY_REFRESH_EVERY = 10
