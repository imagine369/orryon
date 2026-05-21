# Orryon — Architecture

This document describes the system architecture, folder responsibilities, data flow, and development workflow. It is intended for contributors and self-hosters.

---

## System Overview

Orryon has two UI paths that share the same Python core:

```
┌──────────────────────────────────────────────────────────────────────┐
│                         MODERN STACK (primary)                       │
│                                                                      │
│  ┌──────────────┐    REST + SSE     ┌────────────────────────────┐  │
│  │  Next.js 16  │ ◄──────────────►  │  FastAPI                   │  │
│  │  React 19    │  :3000 ↔ :8000    │  backend/main.py           │  │
│  │  Tailwind 4  │                   │  + routers/ (6 modules)    │  │
│  │  PWA         │                   │                            │  │
│  └──────────────┘                   └─────────┬──────────────────┘  │
│                                               │                      │
│                        ┌──────────────────────┼────────────────┐    │
│                        │                      │                │    │
│                   core/grok_agent.py       db.py          scheduler │
│                   (xAI Grok SSE)        (SQLite)       (APScheduler)│
│                        │                      │                │    │
│                   core/tools.py          config.py     email_sender │
│                   core/system_prompt.py                              │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│                    LEGACY STACK (maintenance mode)                    │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Streamlit (app.py + ui/ + pages/)                           │   │
│  │  Self-contained: renders UI, calls core/ directly, no API    │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Folder Responsibilities

### `backend/` — FastAPI Application

The primary API server. Organized as modular routers:

| File | Responsibility |
|------|----------------|
| `main.py` | App creation, CORS, lifespan, router registration |
| `auth.py` | JWT token creation, verification, FastAPI security dependency |
| `deps.py` | Shared dependencies: rate limiter, subscription plan enforcement |
| `schemas.py` | All Pydantic request/response models |
| `routers/auth.py` | OTP email sign-in, demo mode, `POST /api/auth/*` |
| `routers/chat.py` | SSE streaming AI chat, `POST /api/chat` |
| `routers/finance.py` | Dashboard, transactions, budget, bills, income, net-worth, forecast |
| `routers/organize.py` | Events, goals, notes, tasks, grocery, user lists |
| `routers/account.py` | Settings, email change, export, share links, Stripe billing, receipts |
| `routers/connections.py` | CSV import (live), Plaid bank link (stub), tiered import system |

### `frontend/` — Next.js Application

The primary UI. Key files:

| Path | Purpose |
|------|---------|
| `src/lib/api.ts` | API client (`request()`, `streamChat()`) — the contract between frontend and backend |
| `src/lib/auth-context.tsx` | React context for auth state |
| `src/app/` | Page routes and layouts |
| `src/components/` | Reusable React components (dashboard tabs, nav, chat) |

### `core/` — Shared Business Logic

Used by both the FastAPI backend and the Streamlit app. This is the "brain" of orryon:

| File | Purpose |
|------|---------|
| `grok_agent.py` | Streaming xAI Grok agent with tool calling, memory extraction |
| `tools/` | Tool schemas (`schemas.py`), handlers (`helpers.py`), registry (`registry.py`) |
| `canonical_tools.py` | Single source of truth for advertised tool names |
| `system_prompt.py` | Finance-first system prompt (v6; must match `_TOOL_MAP`) |
| `scheduler.py` | APScheduler jobs (net worth snapshots, bill reminders, digests) |
| `csv_importer.py` | Bank CSV parsing (for future import feature) |
| `google_calendar.py` | Google Calendar OAuth scaffold |

### Root-Level Modules

| File | Purpose |
|------|---------|
| `db.py` | SQLite schema, auto-migrations, CRUD helpers. Shared by all paths. |
| `config.py` | Environment variable loading from `.env` |
| `email_sender.py` | SMTP email sending (OTP codes, digests) |
| `app.py` | Legacy Streamlit UI (maintenance mode, not actively developed) |

---

## Data Flow: AI Chat

The most complex flow is the streaming chat, which connects the frontend to the Grok agent:

```
1. User types message in frontend chat
2. frontend/src/lib/api.ts → streamChat() sends POST /api/chat
3. backend/routers/chat.py validates auth, checks rate limit & spend cap
4. Calls core/grok_agent.py → run_orryon_stream()
5. grok_agent builds messages array (system prompt + context + history + user msg)
6. Streams SSE from xAI Grok API
7. For each chunk:
   - Text tokens → yield {"type": "token", "content": "..."} → SSE to frontend
   - Tool calls → execute via core/tools/ → append result → loop back to step 6
8. Final message → yield {"type": "done", ...} → SSE to frontend
9. Save to chat_messages table, extract memories in background thread
```

### SSE Event Format

The frontend (`streamChat` in `api.ts`) expects these SSE events:

```
data: {"type": "token",  "content": "partial text..."}
data: {"type": "tool",   "name": "log_expense", "label": "Logging expense"}
data: {"type": "retry",  "reason": "no_tool_called"}
data: {"type": "done",   "message": "...", "actions": [...], "tabs": [...], "undo_info": ...}
data: {"type": "error",  "message": "..."}
data: [DONE]
```

### Canonical Tool Surface

Grok is taught the names in `core/canonical_tools.py` (also listed in
`core/system_prompt.py` v6). Only those names are sent in `GROK_TOOL_SCHEMAS`
(each chat request). Legacy aliases remain in `_TOOL_MAP` so old tool-call IDs
still execute, but are not sent to the API. Memory is injected by
`grok_agent.py` (background extraction) — not via `save_memory` tools.

### Usage limits by plan (`backend/deps.py`)

| Plan | Price/mo | Chat msgs/mo | API spend cap (~27% of price) | Voice min |
|------|----------|--------------|-------------------------------|-----------|
| trial (14d) | $0 | 3,000 | $2.00 (fixed) | 0 |
| pro | $22 | 3,000 | $5.94 | 300 |
| premium | $33 | unlimited* | $8.91 | 650 |
| premium_plus | $49 | unlimited* | $13.23 | 1,200 |

Token caps scale with spend cap (~375k tokens per $1 of API budget).
\*Unlimited messages are bounded by monthly spend + token caps (fair use).
Enforced via `check_monthly_api_quota()` on chat, voice, receipt vision, and
background memory extraction. Metered in `user_api_spend` via `record_token_spend`.

| Section  | Write tool(s)               | Read/analysis tool(s)   |
|----------|-----------------------------|--------------------------|
| Bills    | `log_bill`                  | `get_bills`              |
| Expenses | `log_expense`               | `get_expenses`           |
| Calendar | `add_calendar_event`        | `get_calendar`           |
| Notes    | `add_note`                  | `get_notes`              |
| Journal  | `log_journal_entry`         | `get_journal`            |
| Goals    | `create_goal`, `update_goal`| `get_goals`              |
| Insights | —                           | `generate_insights`      |
| Forecast | —                           | `generate_forecast`      |
| Yearly   | —                           | `generate_yearly_summary`|

Two server-side safety nets wrap the dispatcher:

1. **`normalize_args`** (`core/tools.py`) — coerces loose dates to ISO
   (`YYYY-MM-DD` for date-only fields, `YYYY-MM-DDTHH:MM:SS` for `start`/`end`),
   snaps categories/moods/frequencies to canonical values via fuzzy match,
   and forces amounts to positive floats. Runs on every `execute_tool` call.
2. **`_needs_tool_reprompt`** (`core/grok_agent.py`) — if Grok produces
   neither a tool call nor a clarifying question on a turn whose user
   message contained an action verb, a one-shot system correction is
   appended and the call is retried. Capped at one retry per turn; emits
   a `{"type":"retry"}` SSE event so the UI can show a micro indicator.

---

## Database

Single SQLite file (`finance.db` by default, configurable via `DB_PATH`).

Key tables: `users`, `transactions`, `events`, `goals`, `notes`, `action_items`, `grocery_items`, `subscriptions`, `budget_categories`, `chat_messages`, `user_memory`, `recurring_income`, `net_worth_snapshots`, `user_lists`, `list_items`, `share_tokens`.

`db.py` handles schema creation and auto-migration on import. No ORM — all queries are raw SQL with parameterized values.

---

## Authentication

- **JWT (HS256)** — 30-day tokens, signed with `JWT_SECRET`
- **OTP email** — 6-digit codes sent via SMTP (falls back to on-screen display in dev)
- **Demo mode** — issues a token for `demo@orryon.app` (disabled in production)
- **Subscription enforcement** — `require_active_plan` dependency blocks requests if trial expired

---

## Local Development

### Full Stack (recommended)

```bash
# 1. Setup
python -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
cd frontend && npm install && cd ..
cp .env.example .env  # add XAI_API_KEY

# 2. Run (two terminals)
uvicorn backend.main:app --reload --port 8000     # Terminal 1
cd frontend && npm run dev                          # Terminal 2

# 3. Open http://localhost:3000
```

### Backend Only

```bash
uvicorn backend.main:app --reload --port 8000
# API docs at http://localhost:8000/docs
```

### Streamlit Only (legacy)

```bash
pip install -r requirements.txt
streamlit run app.py
# Open http://localhost:8501
```

---

## Self-Hosting

### Docker

```bash
docker build -f backend/Dockerfile -t orryon-backend .
docker run -p 8000:8000 \
  -e XAI_API_KEY=your_key \
  -e JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))") \
  -e NODE_ENV=production \
  -v orryon-data:/app \
  orryon-backend
```

Build the frontend separately with `NEXT_PUBLIC_API_URL` pointing to your backend:

```bash
cd frontend
NEXT_PUBLIC_API_URL=https://api.your-domain.com npm run build
```

### Railway

- Backend: use `backend/railway.json` (Dockerfile builder, auto-detected)
- Frontend: deploy `frontend/` to Vercel or Railway's static hosting
- Set `FRONTEND_URL` on the backend for CORS

### Render

- `render.yaml` is pre-configured for Docker + FastAPI with persistent disk at `/data`
- Set `FRONTEND_URL`, `XAI_API_KEY`, `JWT_SECRET` in the Render dashboard

---

## Future Migration Path

### Near-Term

1. **CSV Import** — Live. `POST /api/import/csv` accepts bank CSVs, auto-detects format, returns a preview. `POST /api/import/csv/confirm` commits selected transactions. Frontend upload UI is the remaining piece.
2. **Bank Import (Plaid)** — Stubs exist in `backend/routers/connections.py`. Config keys are in `config.py`. Needs `pip install plaid-python` and the Link token flow.
3. **Google Calendar Sync** — `core/google_calendar.py` has the OAuth scaffold. Add a UI trigger and bidirectional sync.

### Medium-Term

4. **PostgreSQL Migration** — Replace `db.py` with SQLAlchemy + Alembic. The schema is already well-structured.
5. **Background Job Queue** — Replace APScheduler with Celery + Redis for distributed deployments.
6. **Vector Memory** — Replace key-value `user_memory` with pgvector embeddings for semantic recall.

### Long-Term

7. **Streamlit Deprecation** — Once all features are in the Next.js UI, archive `app.py` and `ui/`.
8. **Multi-Device Sync** — WebSocket layer for real-time updates across devices.
9. **Mobile App** — React Native wrapper around the API, or enhanced PWA.

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| SQLite over PostgreSQL | Local-first philosophy; zero external dependencies for self-hosting |
| Raw SQL over ORM | Performance, transparency, fewer abstraction layers |
| Grok-only AI | Policy decision; single-provider simplicity, xAI tool calling support |
| JWT over sessions | Stateless auth fits the decoupled frontend/backend architecture |
| SSE over WebSocket | Simpler for one-directional streaming; sufficient for chat |
| APScheduler over Celery | No Redis/broker dependency; fits single-process deployment |
| Shared `core/` | Avoids duplicating business logic between Streamlit and FastAPI paths |
