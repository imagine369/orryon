# Contributing to Orryon

Thank you for helping improve Orryon. The project is MIT-licensed. This guide covers the constraints every PR must respect.

## Before you open a PR

1. Read [ARCHITECTURE.md](ARCHITECTURE.md) for the system diagram and chat flow.
2. Read [docs/PRODUCT_BOUNDARY.md](docs/PRODUCT_BOUNDARY.md) for what we build vs defer.
3. Read [docs/ENGINEERING.md](docs/ENGINEERING.md) for conventions and phase notes.
4. Use the [PR checklist](.github/pull_request_template.md) in your description.

## Development setup

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements-dev.txt
cd frontend && npm ci && cd ..
cp .env.example .env   # add XAI_API_KEY for live chat tests

# Terminal 1
uvicorn backend.main:app --reload --port 8000

# Terminal 2
cd frontend && npm run dev
```

### Verify locally

```bash
pytest tests/ -q
cd frontend && npm run test && npm run build
python scripts/smoke_test.py
./scripts/check_core_layering.sh
./scripts/check_file_length.sh
```

CI runs the same guards on every push to `main`.

## Layering: `core/` must not import `backend/`

Shared business logic lives in `core/`. The FastAPI app in `backend/` imports `core/` — never the reverse.

```bash
./scripts/check_core_layering.sh
```

If you need something from HTTP/auth layers inside `core/`, pass it in as an argument or move the glue to `backend/`.

## File size limits

| Threshold | Effect |
|-----------|--------|
| **> 400 lines** | Warning (split before it grows) |
| **> 500 lines** | CI fails on non-allowlisted files |

```bash
./scripts/check_file_length.sh
```

Grandfathered legacy files are listed in `scripts/file-length-allowlist.txt`. **Do not add new entries** without team agreement. Prefer extracting a focused module instead.

Override for a one-off audit: `ORRYON_MAX_FILE_LINES=600 ./scripts/check_file_length.sh`

### God-file freeze

Do not add new logic to these shells — extract hooks, subcomponents, or `core/` modules:

- `frontend/src/app/(app)/home/page.tsx`
- `frontend/src/components/settings-panel.tsx`
- `frontend/src/components/reset-anchor-session.tsx`

## Adding an agent tool

Follow the full checklist in [docs/ADDING_A_TOOL.md](docs/ADDING_A_TOOL.md):

1. Schema → `core/tools/schemas/<domain>.py`
2. Handler → `core/tools/handlers/<domain>.py`
3. **One** registry entry → `TOOL_SPECS` in `core/tools/registry.py` (`impl` + `tabs`)
4. Canonical name → `CANONICAL_TOOL_NAMES` in `core/canonical_tools.py`
5. Reprompt section → `_REPROMPT_SECTIONS` in `core/canonical_tools.py`
6. Tests → extend `tests/test_tools_registry.py` / `tests/tool_minimal_args.py`
7. User-facing policy → `docs/CAPABILITIES.md` if product-visible

Import-time validation in `core/tools/__init__.py` fails fast if schemas and `TOOL_SPECS` diverge.

**Do not** add a second tool map — `TOOL_SPECS` is the single registry; legacy aliases go through `resolve_tool_name()` only.

### Capability budget

Hard caps in `core/capability_budget.py`:

| Cap | Limit |
|-----|-------|
| Canonical tools | 72 (`CANONICAL_TOOL_NAMES`) |
| `system_prompt.py` lines | 300 |

Adding a tool or growing the prompt requires **trading** (remove/merge elsewhere) or raising the cap in code review. Run `pytest tests/test_capability_budget.py`.

### Delete over refactor

When you touch agent code, legacy aliases, or scaffolds: **remove** unless tests or production traffic need it. Chat uses one Responses loop (`responses` / `responses_degraded` only) — do not add a Completions chat path.

## Capabilities & system prompt

Product capability policy: [docs/CAPABILITIES.md](docs/CAPABILITIES.md).

`core/system_prompt.py` injects every `CANONICAL_TOOL_NAMES` entry into the prompt at runtime. After adding a tool, run:

```bash
pytest tests/test_capabilities_sync.py -q
```

## Database changes

Raw SQL only — no SQLAlchemy/ORM (see [MIGRATION_ROADMAP.md](MIGRATION_ROADMAP.md) Phase B.1).

- DDL: `db/schema/schema_*.py`
- Migrations: numbered SQL in `db/migrations/` (`*.postgres.sql` / `*.sqlite.sql`)
- Apply: `python db/migrate.py`

Test on both dialects when possible: `DATABASE_URL=postgresql://... pytest tests/ -q`

## Commit style

Match existing history: `Phase N: short summary.` or imperative one-liner describing **why**.
