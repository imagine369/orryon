# Railway backend — fix 502 / healthcheck failures

## Your setup (SQLite)

| Item | Value |
|------|--------|
| Volume `orryon-volume` | Mount path **`/data`** only |
| `DB_PATH` | `/data/finance.db` |
| `DATABASE_URL` | **Unset** (delete if present) |

Do **not** mount the volume at `/app` — it hides the application and causes `No module named 'config'`.

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
