# Engineering conventions

## God-file freeze

Do not add new logic to these shells — extract into hooks, components, or `core/` modules:

- `frontend/src/app/(app)/home/page.tsx`
- `frontend/src/components/settings-panel.tsx`
- `frontend/src/components/reset-anchor-session.tsx`

## File size cap

**No new file over 400 lines** without explicit justification documented here.

Run locally:

```bash
bash scripts/check_file_length.sh
```

Override for a one-off audit: `ORRYON_MAX_FILE_LINES=600 bash scripts/check_file_length.sh`

Known exceptions (legacy; split when touched):

| File | Lines | Notes |
|------|-------|-------|
| `frontend/src/components/landing/feature-section.tsx` | ~580 | Marketing landing only |
| `frontend/src/app/(site)/help/page.tsx` | ~650 | Help content |
| `frontend/src/app/(site)/login/page.tsx` | ~495 | Auth flows |

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

## Tool registry

- **Add a tool:** follow [ADDING_A_TOOL.md](./ADDING_A_TOOL.md) (schema → handler → `TOOL_SPECS` → canonical name → reprompt).
- **Dispatch:** `core/tools/registry.py` — `TOOL_SPECS` holds `impl` + `tabs`; `bind_handler` returns `{result, tabs}`.
- **Legacy aliases:** `core/canonical_tools.resolve_tool_name()` at dispatch only.
- **Args:** normalize in `core/tools/normalize.py` only — not in handlers.
