# Integrations checklist

Each external integration must ship **all** rows before it is considered live. Partial exposure (Swagger routes, settings UI, or README claims without the full pipeline) is not allowed.

| Stage | What it means |
|-------|----------------|
| **Config** | Env flags + `config.py` gates (`*_ENABLED`) |
| **Connect** | OAuth or link flow the user can complete |
| **Sync job** | Pull/push or scheduler hook |
| **UI** | Settings or dashboard surface |
| **Tests** | Gated behavior in `tests/test_integrations.py` |
| **Docs** | This file + `MIGRATION_ROADMAP.md` |

## CSV import — **Live**

| Stage | Status | Location |
|-------|--------|----------|
| Config | Always on (no flag) | `backend/routers/connections.py` |
| Connect | Upload CSV | Budget tab → Import CSV |
| Sync job | N/A (one-shot import) | — |
| UI | Budget import flow | `frontend` finance/budget |
| Tests | `test_scaffold_gates` (Plaid absent) | `tests/` |
| Docs | README tier 2 | `README.md` |

## Google Calendar — **Live when `GOOGLE_CALENDAR_OAUTH_ENABLED=1`**

| Stage | Status | Location |
|-------|--------|----------|
| Config | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALENDAR_OAUTH_ENABLED` | `config.py` |
| Connect | OAuth auth/callback | `backend/routers/calendar_google.py` |
| Sync job | Pull every 6h + push on create + manual sync | `core/integrations/google_calendar.py`, `core/scheduler.py` |
| UI | Settings → Connected; ICS import on Calendar tab | `connected-view.tsx`, `calendar-tab.tsx` |
| Tests | `test_scaffold_gates`, `test_integrations` | `tests/` |
| Docs | This file | — |

OAuth routes are **hidden from OpenAPI** when the flag is off (`include_in_schema=False`). `/api/calendar/google/status` stays available so the UI can show ICS-only mode.

ICS import (`/api/calendar/import/ics`) works without OAuth — always on.

## Plaid — **Not live**

| Stage | Status | Location |
|-------|--------|----------|
| Config | `PLAID_*` keys exist; `PLAID_LINK_ENABLED` defaults off | `config.py` |
| Connect | Not implemented | — |
| Sync job | Not implemented | — |
| UI | None | — |
| Tests | `test_plaid_stub_routes_removed` | `tests/test_scaffold_gates.py` |
| Docs | Roadmap A.1 only | `MIGRATION_ROADMAP.md` |

No Plaid HTTP routes. `GET /api/connections` lists Plaid as `planned` only.

## Email (Resend / SMTP) — **Live when configured**

| Stage | Status | Location |
|-------|--------|----------|
| Config | `RESEND_API_KEY` or `SMTP_*` | `config.py` |
| Connect | N/A (server-side) | — |
| Sync job | Reminders, digests, weekly reports | `core/scheduler.py` |
| UI | OTP login, contact form | login, contact pages |
| Tests | OTP + smoke paths | `tests/`, `scripts/smoke_test.py` |
| Docs | `DEPLOY.md` | — |

Implementation: `core/email/` (`otp.py`, `digest.py`, `contact.py`, `providers.py`).
