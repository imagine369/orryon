# Deploying Orryon to Railway + orryon.com

## Architecture
- **Frontend** (Next.js) → Railway service → `www.orryon.com`
- **Backend** (FastAPI) → Railway service → `api.orryon.com`
- **DNS** managed on Squarespace

---

## Step 1 — Push to GitHub
```bash
git add -A && git commit -m "production deployment config"
git push
```

---

## Step 2 — Deploy Backend on Railway

1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Select the `orryon` repo
3. Railway detects `railway.json` at the root → uses the backend Dockerfile automatically
4. Go to the service → **Variables** tab → add the following:

### Backend Environment Variables

```
NODE_ENV=production

# LLM
LLM_PROVIDER=grok
XAI_API_KEY=          ← your xAI key from console.x.ai
GROK_MODEL=grok-4.3

# Auth — generate with: python -c "import secrets; print(secrets.token_hex(32))"
JWT_SECRET=           ← generate a random 64-char hex string

# SMTP — copy from your local .env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=            ← copy from .env
SMTP_PASS=            ← copy from .env
SMTP_FROM=            ← copy from .env
CONTACT_EMAIL=        ← copy from .env

# URLs
APP_URL=https://www.orryon.com
FRONTEND_URL=https://www.orryon.com

# Database — attach a Railway Volume at /data first
DB_PATH=/data/finance.db

# Stripe — copy from your local .env
STRIPE_SECRET_KEY=    ← copy from .env
STRIPE_WEBHOOK_SECRET=← copy from .env
STRIPE_PRICE_MONTHLY= ← copy from .env
STRIPE_PRICE_ANNUAL=  ← copy from .env

# Admin
ADMIN_SECRET=         ← copy from .env

# Sentry (optional)
SENTRY_DSN=           ← copy from .env.example if using Sentry
```

5. **Add a Volume**: Railway service → Storage → Add Volume → mount at `/data`
   (This keeps the SQLite database persistent across deploys)

6. **Add custom domain**: Settings → Networking → Custom Domain → `api.orryon.com`
   Copy the Railway-provided CNAME target — you'll need it for DNS.

---

## Step 3 — Deploy Frontend on Railway

1. In the same Railway project → **New Service** → GitHub → same `orryon` repo
2. **Root Directory**: set to `frontend`
3. Railway detects `frontend/railway.json` → uses Nixpacks + Next.js standalone
4. Go to the service → **Variables** tab → add the following:

### Frontend Environment Variables

```
NODE_ENV=production

# Backend URL — your Railway backend custom domain
NEXT_PUBLIC_API_URL=https://api.orryon.com

# Stripe price IDs — copy from your local .env
NEXT_PUBLIC_STRIPE_PRICE_MONTHLY=  ← copy from .env
NEXT_PUBLIC_STRIPE_PRICE_ANNUAL=   ← copy from .env

# Waitlist admin export
ADMIN_SECRET=                       ← copy from .env

# Sentry (optional)
NEXT_PUBLIC_SENTRY_DSN=             ← copy from .env.example if using Sentry
```

5. **Add custom domain**: Settings → Networking → Custom Domain → `www.orryon.com`
   Copy the Railway-provided CNAME target.

---

## Step 4 — Update Stripe Webhook

Once the backend is live, go to [dashboard.stripe.com](https://dashboard.stripe.com) →
Developers → Webhooks → Add endpoint:

```
https://api.orryon.com/api/stripe/webhook
```

Events to forward:
- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

Copy the new **Webhook Secret** and update `STRIPE_WEBHOOK_SECRET` in Railway.

---

## Step 5 — Configure DNS on Squarespace

Squarespace → Domains → orryon.com → DNS Settings → Add records:

| Type  | Host | Value                              |
|-------|------|------------------------------------|
| CNAME | www  | (Railway frontend CNAME target)    |
| CNAME | api  | (Railway backend CNAME target)     |

DNS propagates in 5–30 minutes.

---

## Step 6 — Verify

- [ ] `https://api.orryon.com/api/health` returns `{"status":"ok"}`
- [ ] `https://www.orryon.com` loads the site
- [ ] Sign-up OTP email arrives
- [ ] Contact form at `https://www.orryon.com/contact` delivers to your inbox
- [ ] Waitlist form submits successfully
