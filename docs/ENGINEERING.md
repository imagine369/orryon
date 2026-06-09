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

## Tool registry

- **Add a tool:** follow [ADDING_A_TOOL.md](./ADDING_A_TOOL.md) (schema → handler → `TOOL_SPECS` → canonical name → reprompt).
- **Dispatch:** `core/tools/registry.py` — `TOOL_SPECS` holds `impl` + `tabs`; `bind_handler` returns `{result, tabs}`.
- **Legacy aliases:** `core/canonical_tools.resolve_tool_name()` at dispatch only.
- **Args:** normalize in `core/tools/normalize.py` only — not in handlers.
