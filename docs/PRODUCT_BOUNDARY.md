# Product boundary — “everything” vs Life OS

Strategic scope for Orryon. Architecture and the agent runtime follow this document.

## One-line promise

**Ask almost anything in chat; when it’s about the user’s life in Orryon, the product actually does something via tools.**

That is **not** open-ended automation (booking rides, paying bills, sending email on their behalf, browsing arbitrary sites to complete purchases).

---

## Three layers

| Layer | What it is | Examples | Runtime |
|-------|------------|----------|---------|
| **General chat** (“everything” within limits) | Broad assistant: explain, draft, plan, tutor (non-code), life skills | “How does inflation work?”, “Proofread this email”, “Steps to hem pants” | xAI Responses API, **no** Orryon tool required |
| **Life OS tools** | Read/write the user’s stored data + bounded live context | Log expense, calendar, notes, health vitals, `get_weather`, news search | Responses API + `core/tools/` (`execute_tool`) |
| **Out of scope** | Automation we do not implement | Book Uber, auto-pay, shop checkout, send email as user, arbitrary multi-step web agents | Not in roadmap — document under “Not yet” in `docs/CAPABILITIES.md` |

### General chat — in

- Q&A, writing help, opinions, health **education** (with disclaimer)
- Three hard limits: no porn, no substantial code, no image product (see `docs/CAPABILITIES.md`)

### Life OS tools — in

- The **68 canonical tools** in `CANONICAL_TOOL_NAMES` (budget: 72 max — see `core/capability_budget.py`)
- xAI Agent Tools (`web_search`, `x_search`) when available; RSS `search_web` in degraded Responses mode
- Destructive actions require in-chat confirmation (`user_confirmed`)

### Automation — out

- Acting on external services without a dedicated, reviewed integration (`docs/INTEGRATIONS.md`)
- Open-ended “do anything on the web” agent swarms
- Background actions the user did not initiate in chat (except scheduler digests/reminders already productized)

**Architecture rule:** new “do it for them” features must either (a) map to an existing Life OS tool + user data, or (b) go through the integrations checklist — not a new ad-hoc agent path.

---

## Agent runtime (follows the boundary)

| Path | API | Used for |
|------|-----|----------|
| `responses` | xAI Responses | **All user chat** (SSE + WebSocket) |
| `responses_degraded` | xAI Responses (no web/X agent tools) | Same chat loop; RSS `search_web` only |
| `completions` | xAI Chat Completions (`call_grok_async`) | **Background only** — memory extraction, session summary |

There is **no** Completions-based chat loop. Degraded mode is still Responses.

Observability tags (`agent_path`, `tool_name`, `reprompt`, `round_count`) are set on agent failures — see `core/agent_observability.py`.

---

## Delete over refactor

When touching agent code, legacy tool aliases, or scaffolds:

1. **Default to removal** if nothing in production depends on it.
2. **Keep** only with evidence: tests for dispatch compatibility, or logged traffic (Sentry / DB).
3. **Do not** add a second chat runtime or second tool registry to “support both.”

### Legacy tool aliases

`LEGACY_TOOL_ALIASES` in `core/canonical_tools.py` exists so **old chat sessions** can replay tool calls (`add_expense` → `log_expense`). They are not sent to Grok. Remove an alias only after confirming no stored messages reference it.

### Capability budget

New Life OS surface area must **trade**:

- Adding a canonical tool → stay within `MAX_CANONICAL_TOOLS` (72) or remove/merge another tool.
- Growing `system_prompt.py` → stay within `MAX_SYSTEM_PROMPT_LINES` (300) or move prose to `docs/CAPABILITIES.md`.

Enforced in CI: `tests/test_capability_budget.py`.

---

## Related docs

- [docs/CAPABILITIES.md](./CAPABILITIES.md) — user-facing policy
- [ARCHITECTURE.md](../ARCHITECTURE.md) — system diagram and chat flow
- [docs/INTEGRATIONS.md](./INTEGRATIONS.md) — how external services enter the product
- [docs/EXTENSIBILITY.md](./EXTENSIBILITY.md) — plugins/MCP boundary (future)
