# Orryon — Migration & Future Architecture Roadmap

## Current Architecture (v1)

```
Streamlit (UI)
    ├── SQLite (local DB — finance.db)
    ├── core/grok_agent.py → xAI Grok API (direct HTTP)
    ├── core/scheduler.py → APScheduler (background jobs)
    ├── email_sender.py → SMTP (notifications)
    └── core/google_calendar.py → Google Calendar (scaffold)
```

All data lives locally. No cloud sync, no server.

---

## Phase A: Cloud-Ready Migration (when needed)

### A.1 — Database Migration Path

| Step | Action | Notes |
|------|--------|-------|
| 1 | Replace `sqlite3` with `SQLAlchemy` | Same schema, ORM abstraction |
| 2 | Add Alembic for migrations | Version-controlled schema changes |
| 3 | Swap SQLite → PostgreSQL | `DATABASE_URL` in .env |
| 4 | Add connection pooling | `sqlalchemy.pool.QueuePool` |

### A.2 — API Layer

| Step | Action | Notes |
|------|--------|-------|
| 1 | Extract `core/tools.py` into a FastAPI backend | REST endpoints mirror tool functions |
| 2 | Add JWT auth (replace OTP-only) | Session tokens, refresh flow |
| 3 | Serve Streamlit as frontend or migrate to React/Next.js | Streamlit works for MVP; React for scale |

### A.3 — Background Jobs

| Step | Action | Notes |
|------|--------|-------|
| 1 | Replace APScheduler with Celery + Redis | Distributed task queue |
| 2 | Add webhook support for calendar sync | Real-time event push |

---

## Phase B: Multi-Device & Sync

### B.1 — User Data Sync
- Move DB to hosted PostgreSQL (Supabase, Neon, or Railway)
- Add WebSocket layer for real-time UI updates across devices
- Implement conflict resolution for offline edits

### B.2 — Mobile App
- Option 1: PWA improvements (already scaffolded)
- Option 2: React Native wrapper around the API layer
- Option 3: Flutter with shared API backend

---

## Phase C: Integrations

### C.1 — Banking (Plaid)
- Config already in place (`PLAID_CLIENT_ID`, `PLAID_SECRET`)
- Add `core/plaid_client.py` with Link token flow
- Auto-import transactions, replace manual entry as primary

### C.2 — Google Calendar (active scaffold)
- `core/google_calendar.py` is functional — needs OAuth flow trigger in UI
- Add bidirectional sync (push orryon events → GCal, pull GCal → orryon)

### C.3 — Investment Data
- Polygon API config exists (`POLYGON_API_KEY`)
- Add real-time portfolio tracking to dashboard
- Holdings table already supports stocks, ETFs, crypto

---

## Phase D: AI Enhancements

### D.1 — Multi-Model Support
- Current: Grok-only (by policy)
- Future option: Add model router for specialized tasks (vision, embeddings)
- Keep Grok as primary reasoning engine

### D.2 — Semantic Memory
- Current: Key-value `user_memory` table
- Future: Vector embeddings for similarity search across chat history
- Consider `pgvector` extension if migrating to PostgreSQL

### D.3 — Proactive Agent
- Current: Scheduler-based (daily digest, weekly report)
- Future: Event-driven triggers (budget threshold alerts, goal deadline warnings)
- Add push notification support (Web Push API)

---

## Migration Priorities

1. **Immediate** — Google Calendar OAuth flow (scaffold exists)
2. **Short-term** — Plaid integration for auto-import
3. **Medium-term** — PostgreSQL migration + API layer
4. **Long-term** — React frontend + mobile app + multi-device sync

---

## File Reference

| File | Purpose | Migration Impact |
|------|---------|-----------------|
| `db.py` | All data access | Replace with SQLAlchemy |
| `core/grok_agent.py` | AI agent | Stable — no change needed |
| `core/tools.py` | Tool implementations | Extract to API endpoints |
| `core/scheduler.py` | Background jobs | Replace with Celery |
| `core/google_calendar.py` | GCal sync | Expand from scaffold |
| `config.py` | All env vars | Add DATABASE_URL, API keys |
| `app.py` | Streamlit UI | Replace with React or keep |
