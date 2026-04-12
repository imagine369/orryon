# orryon

Your intelligent personal concierge. Track expenses, manage your schedule, set savings goals, and ask anything — all in natural language.

> **Local-first.** All data stays on your device in a single SQLite file. No cloud. No accounts required for the demo.

---

## Deploy in one click

| Platform | Button |
|---|---|
| **Railway** | [![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/template/new?template=https://github.com/your-repo/orryon) |
| **Render** | [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/your-repo/orryon) |

> After deploying, set the `XAI_API_KEY` environment variable in your platform dashboard.
> Render users: set `DB_PATH=/data/finance.db` and attach a persistent disk at `/data` to keep data between deploys.

---

## Features

- **AI Chat** — powered by xAI Grok; just type naturally to add expenses, events, tasks, or goals
- **Dashboard** — net balance, monthly spending, top categories, upcoming events
- **Budget** — transaction history, category breakdown, quick-add expense form
- **Forecast** — spending trends and projections
- **Schedule** — calendar events, tasks, and grocery list
- **Goals** — savings goals with progress tracking
- **Notes** — personal notes and journal
- **OTP Auth** — email-based sign-in (no passwords); demo mode requires no sign-in
- **PWA** — installable as a mobile app (manifest + service worker included)
- **Data Export** — download all your data as a ZIP (SQLite DB + JSON)
- **Share Links** — generate read-only links to your Dashboard

---

## Quick Start

### 1. Clone & install

```bash
git clone <repo-url>
cd orryon
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env` and add at minimum:

```
XAI_API_KEY=your_xai_api_key_here
```

Get an xAI API key at [console.x.ai](https://console.x.ai). All other settings are optional.

### 3. Run

```bash
streamlit run app.py
```

Open [http://localhost:8501](http://localhost:8501). Click **Try the demo →** to skip sign-in.

---

## Configuration (`.env`)

| Variable | Required | Description |
|---|---|---|
| `XAI_API_KEY` | Yes | xAI Grok API key — enables the AI chat |
| `GROK_MODEL` | No | Model name (default: `grok-3-mini`) |
| `SMTP_HOST` | No | SMTP server for OTP emails and reminders |
| `SMTP_PORT` | No | SMTP port (default: `587`) |
| `SMTP_USER` | No | SMTP username / sender address |
| `SMTP_PASS` | No | SMTP password |
| `APP_URL` | No | Public URL (used for share links, default: `http://localhost:8501`) |

Without SMTP, OTP codes are shown on-screen (dev mode). Without `XAI_API_KEY`, AI chat is disabled.

---

## Project Structure

```
app.py                  # Main Streamlit app (landing, auth, all views)
db.py                   # SQLite schema and helpers
config.py               # Environment config
email_sender.py         # SMTP OTP / digest emails
core/
  grok_agent.py         # xAI Grok streaming agent
  tools.py              # AI tool implementations (add expense, event, goal…)
  scheduler.py          # APScheduler background jobs (reminders, digests)
ui/
  dashboard.py          # Dashboard tab
  budget.py             # Budget tab
  forecast.py           # Forecast tab
  schedule.py           # Schedule tab
  goals.py              # Goals tab
  notes.py              # Notes tab
pages/
  Privacy_Policy.py     # Streamlit privacy policy page
  Terms_of_Use.py       # Streamlit terms of use page
static/
  manifest.json         # PWA manifest
  sw.js                 # Service worker
  icon-192.png          # PWA icon
  icon-512.png          # PWA icon
  privacy.html          # Static privacy policy (linked from footer)
  terms.html            # Static terms of use (linked from footer)
```

---

## Data & Privacy

- All data is stored in `finance.db` (SQLite) on your local device.
- Your email address is stored locally if you use OTP sign-in.
- Chat messages are sent to the xAI Grok API to power AI responses. See [xAI's Privacy Policy](https://x.ai/legal/privacy-policy).
- No analytics, no tracking, no cloud sync.

---

## Requirements

- Python 3.11+
- Streamlit 1.35+
- See `requirements.txt` for full dependency list
