# Railway backend — fix 502 / healthcheck failures

## Deploy failed: `config.py is missing`

Your **volume mount path is wrong**. Railway is mounting `orryon-volume` on top of the **app directory** (`/code`, `/app`, `/opt/orryon`, etc.), which hides `config.py` and crashes the container.

**Symptom in logs:** `config.py is missing`, `backend/start.sh: not found`, or restart loop right after `Mounting volume`.

**Start command must be** `sh /image-root/backend/start.sh` (absolute path). If Railway uses `sh backend/start.sh` and the volume is on `/code`, the script is hidden and the container crashes.

**Fix (2 minutes):**

1. Railway → **orryon** backend service (not frontend)
2. **Settings** → **Volumes** (or **Storage** → `orryon-volume`)
3. Set **Mount Path** to: `/data` **only**  
   Remove any mount at `/code`, `/app`, `/opt/orryon`, `/srv/orryon`, or `/usr/local/lib/orryon`
4. **Variables** → `DB_PATH` = `/data/finance.db`
5. **Redeploy** (Deployments → Redeploy, or push an empty commit)

Logs should then show `All imports OK` and `Database mode: SQLite (/data/finance.db)`.

---

## Deploy failed: Healthcheck failure

Build/deploy succeeded but **Network → Healthcheck** failed. Common causes: volume mounted over `/app` or `/opt/orryon` (hides app code), missing `JWT_SECRET`, or process never bound to Railway's `PORT`.

**This repo disables Railway HTTP healthchecks in `railway.json`** so deploys can go live; verify with `curl` after deploy. You can re-enable a health path in the Railway UI once `/api/health` returns 200.

**App code in Docker:** `/code` (with fallback `/image-root`). **Data only:** `/data` via `DB_PATH=/data/finance.db`.

**Check Deploy Logs** (scroll *above* “Healthcheck failure”) for:

| Log | Fix |
|-----|-----|
| `JWT_SECRET must be set` | Set `JWT_SECRET` (64+ char random hex) |
| `REQUEST_SIGNING_MODE must be 'enforce'` | Set `REQUEST_SIGNING_MODE=enforce` |
| `Postgres pool failed` / `DATABASE_URL` | **Unset `DATABASE_URL`** if using SQLite; set `DB_PATH=/data/finance.db` |
| `config.py is missing` | Volume mount must be `/data` only (see above) |
| `Background startup failed` | Usually `JWT_SECRET` or `REQUEST_SIGNING_MODE=enforce` — fix vars, then `curl …/api/ready` |
| `IMPORT ERROR` | Open the traceback — missing env or bad package |

**Healthcheck hostname:** Railway probes with `Host: healthcheck.railway.app`. Orryon does not block that host; if you add host filtering elsewhere, allow it.

**Liveness vs readiness:** `/api/health` always returns `200` once uvicorn is up. `/api/ready` returns `503` until DB + config validation finish — use this to verify the app is actually usable after deploy.

**Required for SQLite on Railway:**

```
NODE_ENV=production
JWT_SECRET=<random 64-char hex>
REQUEST_SIGNING_MODE=enforce
XAI_API_KEY=<your key>
DB_PATH=/data/finance.db
FRONTEND_URL=https://www.orryon.com
APP_URL=https://www.orryon.com
```

**Unset** `DATABASE_URL` unless you have a working Postgres service on Railway.

**Do not set** `WEB_CONCURRENCY` above `1` for SQLite.

After fixing vars, redeploy. Success logs:

```
DATABASE_URL=(unset — SQLite)
All imports OK
orryon backend listening — finishing startup in background
Starting uvicorn (workers=1)...
orryon backend started (AI: enabled)
```

Then: `curl https://api.orryon.com/api/health`

---

## Your setup (SQLite)

| Item | Value |
|------|--------|
| Volume `orryon-volume` | Mount path **`/data`** only |
| `DB_PATH` | `/data/finance.db` |
| `DATABASE_URL` | **Unset** (delete if present) |

Do **not** mount the volume at `/app`, `/srv/orryon`, or `/opt/orryon` — that hides `config.py` and causes:

`ERROR: .../config.py is missing`

## Required env vars (backend service)

- `NODE_ENV=production`
- `JWT_SECRET` (long random string)
- `REQUEST_SIGNING_MODE=enforce`
- `GROK_MODEL=grok-4.3`
- `XAI_API_KEY`
- `FRONTEND_URL` / `APP_URL` (single URL, e.g. `https://www.orryon.com`)
- `REDIS_URL` (Upstash `rediss://...`, recommended)

## After deploy — Deploy Logs should show

```
All imports OK
Database mode: SQLite (/data/finance.db)
Starting uvicorn (workers=1)...
```

## Verify

```bash
curl https://api.orryon.com/api/health
# {"status":"ok"}
```

## Vercel

- `BACKEND_URL=https://api.orryon.com`
- `NEXT_PUBLIC_API_URL=https://api.orryon.com`
