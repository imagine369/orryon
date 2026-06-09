# Engineering conventions

## God-file freeze

Do not add new logic to these shells — extract into hooks, components, or `core/` modules:

- `frontend/src/app/(app)/home/page.tsx`
- `frontend/src/components/settings-panel.tsx`
- `frontend/src/components/reset-anchor-session.tsx`

## File size cap

CI enforces via `scripts/check_file_length.sh`:

| Threshold | Effect |
|-----------|--------|
| **> 400 lines** | Warning |
| **> 500 lines** | Fail (unless on `scripts/file-length-allowlist.txt`) |

Run locally:

```bash
./scripts/check_file_length.sh
```

Grandfathered paths: `scripts/file-length-allowlist.txt` — do not grow those files; split when touched.

Override for a one-off audit: `ORRYON_MAX_FILE_LINES=600 ./scripts/check_file_length.sh`

## Agent runtime

Chat uses **xAI Responses API only** (`core/xai_responses.py`). If Agent Tools (`web_search` / `x_search`) are unavailable, Orryon retries in **degraded Responses mode** with function tools + RSS `search_web` — not Chat Completions.

Memory extraction still uses `call_grok_async` (non-streaming Completions) — not the chat tool loop.

## Memory & session context (Phase 4)

- **Session summary:** when a session exceeds 20 turns, older messages are rolled into `## EARLIER IN THIS CONVERSATION` (`core/session_summary.py`, cached on `chat_sessions.summary`). Refreshed every 10 new turns via background LLM call.
- **Memory dedup:** `save_user_memory` fuzzy-matches existing facts (`core/memory_dedup.py`) before insert.
- **Memory cap:** 100 facts per user; prune lowest-confidence then oldest (`db/memory.py`).
- **Context cache:** `core/context_cache.py` — financial snapshot only; do not extend for chat/memory.
- **Embeddings:** not implemented; add only if keyword + fuzzy memory proves insufficient.

## Conversation & intent (Phase 5)

- **Locale-aware re-prompt:** `core/intent_classifier.py` + `get_user_language()`; `needs_tool_reprompt(..., language=)` in the Responses loop.
- **Chat transport:** WebSocket preferred (`frontend/src/lib/chat-transport.ts` → `streamChatMessage`); SSE fallback only.
- **Event contract:** `core/chat_events.py` + `tests/fixtures/chat_event_contract.json` — SSE and WS must validate.
- **Errors:** never expose raw exceptions to clients; use `USER_FACING_CHAT_ERROR` in `grok_agent` and chat routers.

## Safety & guardrails (Phase 6)

- **Destructive tools:** in-chat confirmation (`confirm_required` + `user_confirmed`); audit log at `GET /api/audit/history`. `/api/approvals/history` is a deprecated alias.
- **HITL queue:** `APPROVALS_HITL_ENABLED` gates `/api/approvals` pending approve/reject — not wired to delete tools.
- **Content policy:** `core/content_policy.py` enforces the three chat limits server-side before the LLM runs.
- **Signing:** production must set `REQUEST_SIGNING_MODE=enforce` on chat + voice. Verify with `backend/scripts/verify_signing.py`. See [DEPLOY.md](./DEPLOY.md).

## Data layer (Phase 8)

- **Migration strategy:** Option A — raw SQL + numbered files in `db/migrations/` (`NNN_name.postgres.sql` / `NNN_name.sqlite.sql`). Tracked in `schema_migrations`. No SQLAlchemy/Alembic/ORM on top of raw SQL.
- **Schema:** per-domain DDL in `db/schema/schema_*.py`, assembled by `db/schema/__init__.py` → `init_db()`.
- **Imports:** barrel `db` exports connection + CRUD + `init_db` only. Domain helpers: `from db.auth import ...`, `from db.chat import ...`, etc.
- **Dialects:** SQLite (local/pytest default); Postgres when `DATABASE_URL` is set. CI runs full pytest on both (`backend` + `backend-postgres` jobs).

## Integrations & extensibility (Phase 9)

- **Checklist:** `docs/INTEGRATIONS.md` — config → connect → sync job → UI → tests → docs before exposing an integration.
- **Email:** `core/email/` (`otp.py`, `digest.py`, `contact.py`, `providers.py`); `email_sender.py` is a compat shim.
- **Google Calendar:** `core/integrations/google_calendar.py` — bidirectional when OAuth enabled; no OpenAPI for OAuth routes when flag is off.
- **Plaid:** not live — no HTTP routes; do not document as available in README/API.
- **Extensibility:** `docs/EXTENSIBILITY.md` — prefer handler **or** route; optional future MCP/plugin boundary.

## Tool registry

- **Add a tool:** follow [ADDING_A_TOOL.md](./ADDING_A_TOOL.md) (schema → handler → `TOOL_SPECS` → canonical name → reprompt).
- **Dispatch:** `core/tools/registry.py` — `TOOL_SPECS` holds `impl` + `tabs`; `bind_handler` returns `{result, tabs}`.
- **Legacy aliases:** `core/canonical_tools.resolve_tool_name()` at dispatch only.
- **Args:** normalize in `core/tools/normalize.py` only — not in handlers.

## Documentation & process (Phase 11)

- **Architecture:** [ARCHITECTURE.md](../ARCHITECTURE.md) — one diagram + unified chat flow (Responses API only).
- **Contributing:** [CONTRIBUTING.md](../CONTRIBUTING.md) — layering, file caps, tool checklist.
- **PR template:** `.github/pull_request_template.md` — god file, single registry, tool tests.
- **Capabilities sync:** `docs/CAPABILITIES.md` + `tests/test_capabilities_sync.py` vs `CANONICAL_TOOL_NAMES` / `system_prompt.py`.
- **ORM:** SQLAlchemy/Alembic **cancelled** — see [MIGRATION_ROADMAP.md](../MIGRATION_ROADMAP.md) Phase B.1.
