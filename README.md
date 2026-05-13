# orryon

Our guide to organized life and calmer days.

> **Local-first.** All data stays on your device in a single SQLite file. No cloud. No accounts required for the demo.

---

## Architecture

Orryon runs as a **Next.js frontend + FastAPI backend**. The legacy Streamlit UI is preserved for quick demos but is no longer the primary interface.

```
┌─────────────────┐       REST + SSE        ┌──────────────────────┐
│  Next.js 16     │ ◄───────────────────────►│  FastAPI (Python)    │
│  React 19 + PWA │  http://localhost:8000   │  backend/main.py     │
│  frontend/      │                          │  + routers/          │
└─────────────────┘                          └──────┬───────────────┘
                                                    │
                                 ┌──────────────────┼───────────────┐
                                 │                  │               │
                            core/grok_agent.py   db.py         core/scheduler.py
                            (xAI Grok SSE)     (SQLite)       (APScheduler)
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full folder map, data flow, and migration roadmap.

---

## Features

- **AI Chat** — powered by xAI Grok; type naturally to add expenses, events, tasks, or goals
- **Dashboard** — net balance, monthly spending, top categories, upcoming events
- **Budget** — transaction history, category breakdown, quick-add expense form
- **Forecast** — spending trends and projections
- **Schedule** — calendar events, tasks, and grocery list
- **Goals** — savings goals with progress tracking
- **Notes** — personal notes and journal
- **Lists** — multi-list system (Todoist-style custom lists)
- **OTP Auth** — email-based sign-in (no passwords); demo mode for local development
- **PWA** — installable as a mobile app (manifest + service worker)
- **Receipt Scanner** — snap a photo to auto-extract expense data (Grok Vision)
- **CSV Import** — upload bank CSVs with auto-detected column mapping (Chase, Amex, generic)
- **Data Export** — download all your data as a ZIP (SQLite DB + JSON)
- **Share Links** — generate read-only dashboard links
- **Stripe Billing** — optional subscription management with trial support

---

## Quick Start

### Prerequisites

- **Python 3.11+** and **Node.js 18+**
- An xAI API key from [console.x.ai](https://console.x.ai)

### 1. Install

```bash
git clone <repo-url> && cd orryon

# Backend
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt

# Frontend
cd frontend && npm install && cd ..
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env → set XAI_API_KEY (everything else is optional)
```

### 3. Run (two terminals)

```bash
# Terminal 1 — API server
source .venv/bin/activate
uvicorn backend.main:app --reload --port 8000
```

```bash
# Terminal 2 — UI
cd frontend
npm run dev
```

Open **http://localhost:3000** — click **Try the demo** to skip sign-in.

> **Tip:** API docs are at http://localhost:8000/docs (auto-generated Swagger UI).

---

## Bank Sync (Upcoming)

Orryon takes a **tiered approach to transaction import**, progressing from maximum privacy to maximum convenience:

| Tier | Method | Privacy | Status |
|------|--------|---------|--------|
| 1 | **Manual entry** via AI chat ("sushi $45 dining") | Full local control | Available |
| 2 | **CSV import** — upload bank statements | File never leaves your device | Available |
| 3 | **Email forwarding** — auto-parse transaction alert emails | Requires SMTP config | Planned |
| 4 | **Plaid bank link** — real-time account sync | Third-party connection | Planned |

**CSV import** is live in the Budget tab — click "Import CSV", select a bank statement (Chase, Amex, or generic), review the preview table, select/deselect rows, and confirm. Plaid integration config keys (`PLAID_CLIENT_ID`, `PLAID_SECRET`) are already in `.env.example` — implementation is next on the roadmap. See `backend/routers/connections.py` for the full plan.

---

## Legacy Streamlit UI

The original Streamlit interface is still functional for quick demos:

```bash
pip install -r requirements.txt      # root requirements.txt (Streamlit deps)
streamlit run app.py                  # opens http://localhost:8501
```

> **Note:** The Streamlit UI is in maintenance mode. New features target the Next.js + FastAPI stack exclusively.

---

## Deploy

### Railway (recommended)

1. Connect your repo to Railway
2. Set the root directory to `.` (the Dockerfile copies from project root)
3. Set environment variables: `XAI_API_KEY`, `JWT_SECRET`, `NODE_ENV=production`
4. Deploy the frontend separately (Vercel, Railway static, etc.) with `NEXT_PUBLIC_API_URL` pointing to your Railway backend URL

Uses `backend/railway.json` (Dockerfile builder) with health checks at `/api/health`.

### Render

`render.yaml` is pre-configured for Docker + FastAPI with a persistent disk at `/data`. Set `FRONTEND_URL` and secrets in the Render dashboard.

### Docker (local)

```bash
docker build -f backend/Dockerfile -t orryon-backend .
docker run -p 8000:8000 --env-file .env orryon-backend
```

---

## Configuration (`.env`)

| Variable | Required | Description |
|---|---|---|
| `XAI_API_KEY` | **Yes** | xAI Grok API key — enables the AI chat |
| `JWT_SECRET` | Prod | Secret for JWT signing (auto-generated in dev) |
| `GROK_MODEL` | No | Model name (default: `grok-3-mini`) |
| `SMTP_HOST` | No | SMTP server for OTP emails and reminders |
| `SMTP_PORT` | No | SMTP port (default: `587`) |
| `SMTP_USER` | No | SMTP username / sender address |
| `SMTP_PASS` | No | SMTP password |
| `APP_URL` | No | Public URL (default: `http://localhost:3000`) |
| `FRONTEND_URL` | No | Frontend origin for CORS (default: `http://localhost:3000`) |
| `DB_PATH` | No | SQLite file path (default: `finance.db`) |
| `PLAID_CLIENT_ID` | No | Plaid API credentials for bank sync (upcoming) |
| `PLAID_SECRET` | No | Plaid API secret |
| `STRIPE_SECRET_KEY` | No | Stripe API key for billing |
| `STRIPE_WEBHOOK_SECRET` | No | Stripe webhook signing secret |
| `SENTRY_DSN` | No | Backend error tracking (Railway) |
| `NEXT_PUBLIC_SENTRY_DSN` | No | Frontend error tracking (Vercel) |
| `NODE_ENV` | No | Set to `production` to disable demo mode |

---

## Error Monitoring (Sentry)

Sentry is now configured with two separate projects:
- **orryon-frontend** (Next.js/React errors, session replays, performance)
- **orryon-backend** (FastAPI/Python errors, API performance)

### Environment Variables Added:
- `SENTRY_DSN` (Railway)
- `NEXT_PUBLIC_SENTRY_DSN` (Vercel)

Sentry will automatically report errors, unhandled exceptions, and performance issues from both frontend and backend.

See `.env.example` for the exact values.

---

## Email / OTP Authentication

Orryon uses **passwordless sign-in** — a 6-digit OTP is sent via email when the user logs in. No passwords are stored.

### Development (no SMTP)

If `SMTP_HOST`, `SMTP_USER`, and `SMTP_PASS` are not set in `.env`, the OTP code is **displayed on-screen** automatically. This lets you develop and test without setting up an email provider.

### Production (SMTP required)

Set the four SMTP variables in `.env` to enable real email delivery:

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=your-app-password       # NOT your regular password — use an App Password
SMTP_FROM=you@gmail.com           # optional, defaults to SMTP_USER
```

**Gmail setup:**
1. Enable 2-Step Verification on your Google account
2. Go to [myaccount.google.com](https://myaccount.google.com) → Security → App Passwords
3. Generate an App Password and paste it as `SMTP_PASS`

**Other providers:** Outlook (`smtp-mail.outlook.com:587`), iCloud (`smtp.mail.me.com:587`), Yahoo (`smtp.mail.yahoo.com:587`).

### Behavior summary

| SMTP configured? | Production? | What happens |
|---|---|---|
| No | No | OTP shown on-screen (dev mode) |
| No | Yes | Login fails — SMTP is required in production |
| Yes (send OK) | Either | OTP sent via email |
| Yes (send fails) | No | OTP shown on-screen as fallback |
| Yes (send fails) | Yes | Login fails — user must retry |

---

## Project Structure

```
orryon/
├── backend/                    # FastAPI application (primary)
│   ├── main.py                 #   App assembly, middleware, lifespan
│   ├── auth.py                 #   JWT creation & verification
│   ├── deps.py                 #   Shared dependencies (rate limiter, plan enforcement)
│   ├── schemas.py              #   Pydantic request/response models
│   ├── routers/
│   │   ├── auth.py             #   OTP sign-in, demo, JWT issuance
│   │   ├── chat.py             #   SSE streaming AI chat
│   │   ├── finance.py          #   Dashboard, transactions, budget, bills, forecast
│   │   ├── organize.py         #   Events, goals, notes, tasks, grocery, lists
│   │   ├── account.py          #   Settings, billing, export, share, receipts
│   │   └── connections.py      #   CSV import, Plaid bank link (upcoming)
│   ├── Dockerfile
│   ├── railway.json
│   └── requirements.txt
│
├── frontend/                   # Next.js 16 application (primary UI)
│   ├── src/
│   │   ├── app/                #   Pages and layouts
│   │   ├── components/         #   React components
│   │   └── lib/                #   API client, auth context, utilities
│   └── package.json
│
├── core/                       # Shared business logic
│   ├── grok_agent.py           #   xAI Grok streaming agent + memory
│   ├── tools.py                #   AI tool definitions and execution
│   ├── system_prompt.py        #   System prompt construction
│   ├── scheduler.py            #   APScheduler background jobs
│   ├── csv_importer.py         #   Bank CSV parsing (Chase, Amex, generic)
│   ├── export.py               #   User data export (shared)
│   └── google_calendar.py      #   Google Calendar sync (scaffold)
│
├── app.py                      # Legacy Streamlit UI (maintenance mode)
├── db.py                       # SQLite schema, migrations, CRUD helpers
├── config.py                   # Environment variable loading
├── email_sender.py             # SMTP email sending
│
├── ARCHITECTURE.md             # Detailed architecture documentation
├── MIGRATION_ROADMAP.md        # Future migration plans
├── PRIVACY.md / TERMS.md       # Legal
└── .env.example                # Environment template
```

---

## Data & Privacy

See [PRIVACY.md](PRIVACY.md) and [TERMS.md](TERMS.md) for the full policies (Effective Date: May 12, 2026 | Version 2.0). These are the authoritative versions and are harmonized with the live frontend legal pages.

- **Local-first** — all data stays in a single SQLite file on your device.
- **AI chat** sends your messages + a context summary to xAI Grok. No full database is shared.
- **Stripe** handles payments — we never store card details.
- **Full data export** (ZIP) and **account deletion** are always available.

---

> **Disclaimer:** Orryon is provided "AS IS" and "AS AVAILABLE" without warranties of any kind. Never make important financial, legal, medical, or mental health decisions based solely on the app or AI outputs. Always consult qualified professionals. See [TERMS.md](TERMS.md) for the full binding terms, including limitation of liability, indemnification, arbitration, and class action waiver.
