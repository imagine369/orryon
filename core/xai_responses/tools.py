"""Tool list and message shaping for the Responses API."""

from __future__ import annotations


def chat_schemas_to_responses_tools(
    schemas: list[dict],
    *,
    include_agent_tools: bool = True,
) -> list[dict]:
    """Merge xAI built-in agent tools with Orryon function tools (Responses format).

    When include_agent_tools is False (degraded mode), omit web_search/x_search and
    expose the RSS search_web function tool instead.
    """
    tools: list[dict] = []
    if include_agent_tools:
        tools.extend([{"type": "web_search"}, {"type": "x_search"}])
    for schema in schemas:
        fn = schema.get("function") or {}
        name = fn.get("name")
        if not name:
            continue
        if include_agent_tools and name == "search_web":
            continue
        tools.append({
            "type": "function",
            "name": name,
            "description": fn.get("description") or "",
            "parameters": fn.get("parameters") or {"type": "object", "properties": {}},
        })
    return tools


def split_instructions_and_input(messages: list[dict]) -> tuple[str, list[dict]]:
    instructions = ""
    input_items: list[dict] = []
    for msg in messages:
        role = msg.get("role")
        content = msg.get("content") or ""
        if role == "system":
            instructions = content
        elif role in ("user", "assistant"):
            input_items.append({"role": role, "content": content})
    return instructions, input_items
