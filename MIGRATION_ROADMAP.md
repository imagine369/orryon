# Orryon — Migration & Future Architecture Roadmap

## Current Architecture (v2)

The primary stack is **Next.js 16 + FastAPI** (Streamlit UI removed).

```
  Next.js 16 (frontend/) ← REST + SSE/WS → FastAPI (backend/)
      ├── backend/routers/     (modular API routers)
      ├── core/grok_agent.py   → xAI Grok API (streaming + tool calling)
      ├── core/tools/          → AI tool schemas, registry, handlers
      ├── core/scheduler.py    → APScheduler (background jobs)
      ├── db.py                → SQLite or Postgres
      └── email_sender.py      → SMTP (OTP, digests)
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
| Streamlit removal | **Done** | Removed `app.py`, `ui/`, `pages/`, root `requirements.txt` |

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

`core/csv_importer.py` already has `parse_csv()`. Wire into the connections router.

| Step | Action |
|------|--------|
| 1 | `POST /api/import/csv` (upload + preview) |
| 2 | `POST /api/import/csv/confirm` (commit parsed rows) |
| 3 | Frontend upload component in the Budget tab |

### A.3 — Google Calendar Sync

`core/google_calendar.py` has the OAuth scaffold. Needs a UI trigger and bidirectional sync.

| Step | Action |
|------|--------|
| 1 | OAuth consent flow in Settings |
| 2 | Push orryon events → Google Calendar |
| 3 | Pull Google Calendar → orryon events |

---

## Phase B: Data Layer Evolution

### B.1 — Database Migration

| Step | Action | Notes |
|------|--------|-------|
| 1 | Replace raw `sqlite3` with SQLAlchemy | Same schema, ORM abstraction |
| 2 | Add Alembic for migrations | Version-controlled schema changes |
| 3 | Swap SQLite → PostgreSQL | `DATABASE_URL` in `.env` |
| 4 | Add connection pooling | `sqlalchemy.pool.QueuePool` |

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

## Phase E: Streamlit Deprecation — **Done**

Removed `app.py`, `ui/`, `pages/`, root `requirements.txt`, and `legacy/README.md`. Production already deployed FastAPI + Next.js only.

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

| File | Purpose | Migration Impact |
|------|---------|-----------------|
| `db.py` | All data access | Replace with SQLAlchemy (Phase B) |
| `core/grok_agent.py` | AI agent | Stable — no change needed |
| `core/tools/` | Tool implementations | Stable — schemas + helpers + registry |
| `core/scheduler.py` | Background jobs | Replace with Celery (Phase B) |
| `core/google_calendar.py` | GCal sync | Expand from scaffold (Phase A) |
| `core/csv_importer.py` | CSV parsing | Wire into connections router (Phase A) |
| `config.py` | All env vars | Add `DATABASE_URL` (Phase B) |
| `backend/` | FastAPI app | Primary — actively developed |
| `frontend/` | Next.js app | Primary — actively developed |
