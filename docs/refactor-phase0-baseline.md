# Refactor Phase 0 — Baseline

**Recorded:** 2026-05-22  
**Scope:** Measurement and guardrails only. No layering refactor, no megafile splits, no agent unification.

This document is the acceptance baseline for **Phase 1** (fix `core/` → `backend/` imports).

---

## Did Phase 0 “work”?

**Phase 0 does not fix the codebase.** It only:

1. Records what is broken today (imports, test counts, build status).
2. Adds scripts so we can tell when Phase 1 is done.

| Command | Before Phase 1 | Meaning |
|---------|----------------|---------|
| `./scripts/verify_phase0_baseline.sh` | **exit 0** | Phase 0 setup is correct |
| `./scripts/check_core_layering.sh` | **exit 1** | Expected — violations not fixed yet |
| `core/` still imports `backend/` | **yes** | Fixed in Phase 1, not Phase 0 |
| Pytest / frontend build | **still failing** | Documented baseline; not Phase 0 scope |

If `verify_phase0_baseline.sh` passes, **Phase 0 worked.**  
If you only ran `check_core_layering.sh` and saw “FAILED”, that is normal until Phase 1.

---

## Phase 1 acceptance criterion (layering)

After Phase 1 completes:

```bash
./scripts/check_core_layering.sh
```

Must exit `0` (no `core/` imports of `backend/`).

**Status (Phase 1 complete):** 0 violations. Enforced in CI via `./scripts/check_core_layering.sh`.

---

## `core/` → `backend/` import map (current)

| File | Line(s) | Import |
|------|---------|--------|
| `core/context_cache.py` | 30 | `from backend.cache import cache_get` |
| `core/context_cache.py` | 45 | `from backend.cache import cache_set` |
| `core/context_cache.py` | 132 | `from backend.cache import cache_delete` |
| `core/grok_agent.py` | 688 | `from backend.deps import get_monthly_spend_cap, get_monthly_token_cap, resolve_plan_for_user` |
| `core/scheduler.py` | 339 | `from backend.backup import backup_database` |
| `core/usage_period.py` | 116–120 | `from backend.routers.account import _all_stripe_customer_ids, _find_paid_subscription, _persist_paid_plan` |

**Verify locally:**

```bash
rg 'from backend|import backend' core/ --glob '*.py'
```

---

## Test & build baseline (this environment)

Commands match `.github/workflows/ci.yml` where applicable.

| Check | Command | Result |
|-------|---------|--------|
| Pytest | `.venv/bin/python -m pytest tests/ -q` | **23 passed, 2 failed** (includes `test_core_plans.py`) |
| Smoke | `.venv/bin/python scripts/smoke_test.py` | **Passed** |
| Frontend build | `cd frontend && npm run build` | **Failed** (TypeScript) |
| Frontend lint | `cd frontend && npm run lint` | **Failed** (162 issues; not run in CI today) |

### Pytest failures (pre-existing; out of Phase 0 scope)

1. `tests/test_api_health.py::test_api_ready_after_startup` — `Failed: background startup did not become ready in time`
2. `tests/test_user_locale.py::test_uk_uses_celsius_mph_miles` — expected `mph`, got `kmh`

### Frontend build failure (pre-existing; out of Phase 0 scope)

- `src/components/life-interests-onboarding.tsx:37` — `life_priorities` type mismatch (`string` vs `LifePriorityId[]`)

### CI today (`.github/workflows/ci.yml`)

- **backend job:** `pytest tests/ -q` + `python scripts/smoke_test.py`
- **frontend job:** `npm ci` + `npm run build` only (no `npm run lint`)

---

## What Phase 0 added to the repo

| Artifact | Purpose |
|----------|---------|
| `docs/refactor-phase0-baseline.md` | This file |
| `scripts/check_core_layering.sh` | Layering guard for Phase 1+ (not wired in CI until violations are zero) |
| `scripts/verify_phase0_baseline.sh` | Runs this checklist (artifacts, layering count, smoke, pytest baseline) |

**Run Phase 0 verification:**

```bash
./scripts/verify_phase0_baseline.sh
```

---

## Phase 1 complete (2026-05-22)

Moved to `core/`: `cache.py`, `plans.py`, `stripe_sync.py`, `backup.py`.  
`backend/cache.py` and `backend/backup.py` are compatibility shims.  
`backend/deps.py` re-exports plan/quota helpers from `core.plans`.

## Next step (Phase 2 — not started)

Split megafiles (`account.py` router, `schemas.py`, `settings-panel.tsx`).
