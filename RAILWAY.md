# Railway backend — fix 502 / healthcheck failures

## Deploy failed: `config.py is missing`

Your **volume mount path is wrong**. Railway is mounting `orryon-volume` on top of `/opt/orryon`, which hides the Docker image (including `config.py`).

**Fix (2 minutes):**

1. Railway → **orryon** backend service (not frontend)
2. **Settings** → **Volumes** (or **Storage** → `orryon-volume`)
3. Set **Mount Path** to: `/data`  
   Remove any mount at `/opt/orryon`, `/srv/orryon`, or `/app`
4. **Variables** → `DB_PATH` = `/data/finance.db`
5. **Redeploy** (Deployments → Redeploy, or push an empty commit)

Logs should then show `All imports OK` and `Database mode: SQLite (/data/finance.db)`.

---

## Deploy failed: Healthcheck failure (~5 min)

Build/deploy succeeded but **Network → Healthcheck** failed. The container never returned `200` on `/api/health` in time.

**Check Deploy Logs** (scroll *above* “Healthcheck failure”) for:

| Log | Fix |
|-----|-----|
| `JWT_SECRET must be set` | Set `JWT_SECRET` (64+ char random hex) |
| `REQUEST_SIGNING_MODE must be 'enforce'` | Set `REQUEST_SIGNING_MODE=enforce` |
| `Postgres pool failed` / `DATABASE_URL` | **Unset `DATABASE_URL`** if using SQLite; set `DB_PATH=/data/finance.db` |
| `config.py is missing` | Volume mount must be `/data` only (see above) |
| `IMPORT ERROR` | Open the traceback — missing env or bad package |

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
Starting uvicorn (workers=1)...
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
