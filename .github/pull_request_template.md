## Summary

<!-- What changed and why (1–3 sentences) -->

## Test plan

- [ ] `pytest tests/ -q`
- [ ] `cd frontend && npm run test && npm run build`
- [ ] `./scripts/check_core_layering.sh`
- [ ] `./scripts/check_file_length.sh`

## PR checklist

- [ ] **God file** — Did you avoid adding logic to `home/page.tsx`, `settings-panel.tsx`, or `reset-anchor-session.tsx`? (Extract hooks/components/`core/` instead.)
- [ ] **Single registry** — Did you avoid a second tool map? New tools go in `TOOL_SPECS` + `CANONICAL_TOOL_NAMES` only (`docs/ADDING_A_TOOL.md`).
- [ ] **Tool tests** — If you added or changed an agent tool, did you add/extend tests (`test_tools_registry.py`, `tool_minimal_args.py`, or domain tests)?
- [ ] **Layering** — No new `core/` → `backend/` imports.
- [ ] **File size** — No new non-allowlisted file over 500 lines; prefer staying under 400.
- [ ] **Capabilities** — If user-facing behavior changed, updated `docs/CAPABILITIES.md` and ran `pytest tests/test_capabilities_sync.py`.
- [ ] **Product boundary** — Change fits [docs/PRODUCT_BOUNDARY.md](docs/PRODUCT_BOUNDARY.md) (Life OS tool vs general chat vs out-of-scope automation).
- [ ] **Capability budget** — If adding a canonical tool or prompt lines, traded or updated `core/capability_budget.py`; `pytest tests/test_capability_budget.py` passes.
