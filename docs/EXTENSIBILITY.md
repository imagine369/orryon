# Extensibility model

## Adding a capability today

Prefer **one** of these paths — not all at once:

1. **Agent tool** — schema in `core/tools/schemas/`, handler in `core/tools/handlers/`, register in `TOOL_SPECS` (`docs/ADDING_A_TOOL.md`). No new router if the agent is the only entry point.

2. **HTTP route** — `backend/routers/<domain>.py` when the UI or a public API needs it directly. Reuse existing routers before creating a new file.

3. **Both** — only when the UI and the agent must share behavior; put shared logic in `core/` and keep routers/handlers thin.

Avoid the anti-pattern: new router + new tool + new settings section + new god-component branch for every feature.

## Integrations

Follow `docs/INTEGRATIONS.md` end-to-end before exposing config, Swagger, or UI.

Shared integration logic lives under `core/integrations/` (e.g. `google_calendar.py`), not in routers.

## Optional later: MCP / plugin boundary

Third-party tools should eventually plug in through **one stable interface** (e.g. MCP server or a plugin registry) instead of growing the first-party tool list in the system prompt.

Until that exists, all tools are first-party handlers in `core/tools/`. Do not add ad-hoc HTTP endpoints per external service without going through the integration checklist.
