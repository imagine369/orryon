# Orryon — Migration & Future Architecture Roadmap

## Current Architecture (v2)

The primary stack is **Next.js 16 + FastAPI**.

```
  Next.js 16 (frontend/) ← REST + SSE/WS → FastAPI (backend/)
      ├── backend/routers/     (modular API routers)
      ├── core/grok_agent.py   → xAI Grok API (streaming + tool calling)
      ├── core/tools/          → AI tool schemas, registry, handlers
      ├── core/scheduler.py    → APScheduler (background jobs)
      ├── db/                  → SQLite or Postgres (raw SQL)
      └── core/email/          → OTP, digests, contact, providers
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full system diagram.

---

## Completed Milestones

| Phase | Status | Description |
|-------|--------|-------------|
| API Layer | **Done** | FastAPI backend with JWT auth, 65+ endpoints |
| React Frontend | **Done** | Next.js 16 with PWA, Tailwind, Recharts |
| Router Organization | **Done** | Modular routers (auth, chat, finance, organize, account, connections) |
| Streaming Chat | **Done** | SSE streaming with tool calling, memory, undo |
| Subscription Billing | **Done** | Stripe integration with trial support |
| Receipt Scanning | **Done** | Grok Vision-based receipt OCR |
| Documentation | **Done** | README, ARCHITECTURE.md, this roadmap |
| Backend router split | **Done** | Phase 7 — per-domain routers |
| Data layer (raw SQL) | **Done** | Phase 8 — `db/schema/`, `db/migrations/`, Postgres CI |
| Integrations & email | **Done** | Phase 9 — `core/email/`, Google Calendar |
| Testing & CI guards | **Done** | Phase 10 — agent/chat tests, file-length CI |

---

## Phase A: Integration & Import (next)

### A.1 — Bank Account Linking (Plaid)

Config keys already exist in `config.py`. Implementation goes in `backend/routers/connections.py`.

| Step | Action | Notes |
|------|--------|-------|
| 1 | `pip install plaid-python` | Add to `backend/requirements.txt` |
| 2 | `POST /api/connections/plaid/link-token` | Initialize Plaid Link |
| 3 | `POST /api/connections/plaid/exchange` | Exchange public_token for access_token |
| 4 | `POST /api/connections/plaid/sync` | Pull transactions into `transactions` table |
| 5 | Scheduler job in `core/scheduler.py` | Periodic auto-sync |

### A.2 — CSV/OFX Import

**API done** — `POST /api/import/csv` + confirm via `backend/routers/connections.py` and `core/csv_importer.py`.

| Step | Status |
|------|--------|
| 1 | **Done** — upload + preview |
| 2 | **Done** — confirm commits rows |
| 3 | Optional — richer frontend upload UI in Budget tab |

### A.3 — Google Calendar Sync

**Done (Phase 9)** when `GOOGLE_CALENDAR_OAUTH_ENABLED=1`: OAuth in Settings, pull + push via `core/integrations/google_calendar.py`, scheduler every 6h. ICS import works without OAuth.

---

## Phase B: Data Layer Evolution

### B.1 — Database layer

**Decided (Phase 8):** raw SQL + numbered migrations in `db/migrations/`.

**Cancelled:** SQLAlchemy + Alembic ORM layer — not pursued; would duplicate the existing schema/migration path without benefit for this codebase.

| Step | Status | Notes |
|------|--------|-------|
| 1 | **Done** | Per-domain schema in `db/schema/` |
| 2 | **Done** | Numbered SQL migrations + `schema_migrations` table |
| 3 | **Done** | Postgres via `DATABASE_URL` + psycopg pool; SQLite for dev |
| 4 | Optional | Further pool tuning if needed |

### B.2 — Background Jobs

| Step | Action | Notes |
|------|--------|-------|
| 1 | Replace APScheduler with Celery + Redis | Distributed task queue |
| 2 | Add webhook support for calendar sync | Real-time event push |

---

## Phase C: Multi-Device & Sync

### C.1 — Real-Time Updates
- WebSocket layer for live UI updates across devices
- Conflict resolution for offline edits

### C.2 — Mobile App
- Option 1: Enhanced PWA (already scaffolded, manifest + service worker)
- Option 2: React Native wrapper around the API
- Option 3: Flutter with shared API backend

---

## Phase D: AI Enhancements

### D.1 — Semantic Memory
- Current: key-value `user_memory` table with Grok-extracted facts
- Future: vector embeddings via `pgvector` for similarity search across history

### D.2 — Proactive Agent
- Current: scheduler-based (daily digest, weekly report)
- Future: event-driven triggers (budget threshold alerts, goal deadline warnings)
- Add push notification support (Web Push API)

### D.3 — Multi-Model Support
- Current: Grok-only (by design)
- Future option: model router for specialized tasks (vision, embeddings)
- Keep Grok as primary reasoning engine

---

## Shared Module Extraction Progress

Business logic consolidated in `core/`:

| Module | Status | What it contains |
|--------|--------|-----------------|
| `core/export.py` | **Done** | `build_user_export_zip()` — used by account router |
| `core/sharing.py` | Planned | Share token resolution and creation |
| `core/search.py` | Planned | Multi-table global search |
| `core/dashboard.py` | Planned | Dashboard snapshot aggregation |

---

## File Reference

| File | Purpose | Notes |
|------|---------|-------|
| `db/` | Connection, schema, migrations, domain CRUD | Raw SQL; Postgres + SQLite |
| `core/grok_agent.py` | Chat orchestration | Delegates to `xai_responses` |
| `core/xai_responses.py` | xAI Responses agent loop | Single chat runtime |
| `core/tools/` | Tool schemas, registry, handlers | Add tools via `docs/ADDING_A_TOOL.md` |
| `core/scheduler.py` | Background jobs | Future: Celery (Phase B.2) |
| `core/integrations/google_calendar.py` | GCal sync | Live when OAuth enabled |
| `core/csv_importer.py` | CSV parsing | Live via connections router |
| `config.py` | Env vars | `DATABASE_URL` for Postgres |
| `backend/` | FastAPI app | Primary — actively developed |
| `frontend/` | Next.js app | Primary — actively developed |
