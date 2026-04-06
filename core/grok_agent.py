"""
core/grok_agent.py — Direct xAI Grok API agent with function calling.

Replaces the old CrewAI + LangChain multi-agent system with a single,
fast, direct API call to Grok with OpenAI-compatible tool calling.

Usage:
    from core.grok_agent import run_orryon
    result = run_orryon("sushi agato $312 dining", user_id="abc")
    print(result["message"])        # orryon's reply
    print(result["actions_taken"])  # list of tools called
    print(result["tabs_to_refresh"]) # ["dashboard", "budget"]
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime
from typing import Any

import requests

from config import XAI_API_KEY, GROK_MODEL
from core.system_prompt import get_system_prompt
from core.tools import TOOL_SCHEMAS, execute_tool
from db import fetch_rows

logger = logging.getLogger(__name__)

XAI_API_URL = "https://api.x.ai/v1/chat/completions"
MAX_TOOL_ROUNDS = 5  # prevent infinite loops


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC API
# ─────────────────────────────────────────────────────────────────────────────

def run_orryon(
    user_message: str,
    user_id: str,
    chat_history: list[dict] | None = None,
    user_name: str = "there",
) -> dict:
    """
    Process a natural language message through orryon (Grok with tool calling).

    Returns:
        {
            "message": str,           # orryon's natural language reply
            "actions_taken": list,    # list of {tool, args, result} dicts
            "tabs_to_refresh": list,  # e.g. ["dashboard", "budget"]
            "error": str | None,      # set if something went wrong
        }
    """
    if not XAI_API_KEY:
        return {
            "message": (
                "⚠️ **orryon needs a Grok API key to think.**\n\n"
                "Add `XAI_API_KEY=your_key` to your `.env` file, then restart.\n"
                "Get a key at [console.x.ai](https://console.x.ai) — takes 2 minutes."
            ),
            "actions_taken": [],
            "tabs_to_refresh": [],
            "error": "XAI_API_KEY not set",
        }

    system_prompt = get_system_prompt(user_name=user_name)
    messages = _build_messages(system_prompt, chat_history or [], user_message, user_id)

    actions_taken: list[dict] = []
    all_tabs_to_refresh: set[str] = set()

    try:
        for _round in range(MAX_TOOL_ROUNDS):
            response = _call_grok(messages)
            choice = response["choices"][0]
            msg = choice["message"]
            messages.append(msg)

            tool_calls = msg.get("tool_calls") or []
            if not tool_calls:
                # Final response — no more tool calls needed
                final_text = msg.get("content") or ""
                return {
                    "message": final_text,
                    "actions_taken": actions_taken,
                    "tabs_to_refresh": list(all_tabs_to_refresh),
                    "error": None,
                }

            # Execute all tool calls and collect results
            for tc in tool_calls:
                fn = tc["function"]
                tool_name = fn["name"]
                try:
                    tool_args = json.loads(fn["arguments"])
                except json.JSONDecodeError:
                    tool_args = {}

                result, tabs = execute_tool(tool_name, tool_args, user_id)
                all_tabs_to_refresh.update(tabs)
                actions_taken.append({
                    "tool": tool_name,
                    "args": tool_args,
                    "result": result,
                })

                messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": json.dumps(result),
                })

        # Fell through all rounds without a final text — shouldn't happen
        return {
            "message": "Done! Let me know if you need anything else.",
            "actions_taken": actions_taken,
            "tabs_to_refresh": list(all_tabs_to_refresh),
            "error": None,
        }

    except requests.exceptions.Timeout:
        logger.error("Grok API timeout")
        return {
            "message": "orryon is taking too long to respond. Check your internet and try again.",
            "actions_taken": [],
            "tabs_to_refresh": [],
            "error": "timeout",
        }
    except requests.exceptions.HTTPError as exc:
        status = exc.response.status_code if exc.response else 0
        if status == 401:
            msg = "Invalid API key. Check `XAI_API_KEY` in your `.env` file."
        elif status == 429:
            msg = "Rate limit hit. Wait a moment and try again."
        else:
            msg = f"Grok API error {status}. Try again shortly."
        logger.error("Grok HTTP error %s: %s", status, exc)
        return {"message": msg, "actions_taken": [], "tabs_to_refresh": [], "error": str(exc)}
    except Exception as exc:
        logger.error("run_orryon unexpected error: %s", exc)
        return {
            "message": f"Something went wrong: {exc}",
            "actions_taken": [],
            "tabs_to_refresh": [],
            "error": str(exc),
        }


# ─────────────────────────────────────────────────────────────────────────────
# INTERNAL HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _call_grok(messages: list[dict]) -> dict:
    """Make a single call to the xAI Grok API."""
    headers = {
        "Authorization": f"Bearer {XAI_API_KEY}",
        "Content-Type": "application/json",
    }
    payload: dict[str, Any] = {
        "model": GROK_MODEL,
        "messages": messages,
        "temperature": 0.15,
        "max_tokens": 1024,
        "tools": TOOL_SCHEMAS,
        "tool_choice": "auto",
    }
    resp = requests.post(XAI_API_URL, headers=headers, json=payload, timeout=45)
    resp.raise_for_status()
    return resp.json()


def _build_messages(
    system_prompt: str,
    chat_history: list[dict],
    user_message: str,
    user_id: str,
) -> list[dict]:
    """
    Build the messages array for the API call.
    Includes system prompt, limited chat history for context, and the new user message.
    Also injects a brief context snapshot (net worth, month spending) so orryon
    can give accurate, contextual answers without needing to call extra tools.
    """
    context_snip = _get_context_snapshot(user_id)

    messages: list[dict] = [
        {
            "role": "system",
            "content": system_prompt + f"\n\n## CURRENT USER CONTEXT\n{context_snip}",
        }
    ]

    # Keep last 10 exchanges (20 messages) for context, skip tool messages
    recent = [m for m in chat_history if m.get("role") in ("user", "assistant")][-20:]
    for m in recent:
        messages.append({"role": m["role"], "content": m.get("content") or ""})

    messages.append({"role": "user", "content": user_message})
    return messages


def _get_context_snapshot(user_id: str) -> str:
    """Return a brief plain-text context snapshot for orryon to reference."""
    try:
        from core.tools import _get_net_worth, _get_spending_summary, _get_budget_status
        nw = _get_net_worth({}, user_id)
        spend = _get_spending_summary({"period": "this_month"}, user_id)
        budget = _get_budget_status({}, user_id)

        lines = [
            f"- Net worth: ${nw['net_worth']:,.0f}",
            f"- Total assets: ${nw['total_assets']:,.0f}",
            f"- Total liabilities: ${nw['total_liabilities']:,.0f}",
            f"- This month's spending: ${spend['total']:,.0f}",
        ]
        for cat in spend.get("by_category", [])[:5]:
            lines.append(f"  · {cat['category']}: ${cat['total']:,.0f}")
        for b in budget.get("categories", [])[:4]:
            lines.append(
                f"  · Budget {b['category']}: ${b['spent']:,.0f}/${b['planned']:,.0f} ({b['pct_used']}%)"
            )
        return "\n".join(lines)
    except Exception as exc:
        logger.warning("Context snapshot failed: %s", exc)
        return "(context unavailable)"
