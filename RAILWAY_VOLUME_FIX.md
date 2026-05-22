# Railway volume fix (read this if the backend keeps crashing)

## The problem

Your logs show `ROOT=/code` and `config.py missing`. That means:

1. **The volume is mounted on `/code`**, not `/data`.
2. The volume contains old partial files (`backend/`, `core/`, `db/`) but **no `config.py`**.
3. Railway may still be using an **old start command** (`sh backend/start.sh`).

## Fix in Railway (5 minutes)

### Step 1 — Fix the volume mount

1. Open project → **backend** service (not frontend).
2. **Settings** → **Volumes** / **Storage** → `orryon-volume`.
3. Set **Mount Path** to exactly: **`/data`**
4. Save. If you cannot edit, detach the volume, save, re-attach with mount path `/data`.

Do **not** mount on `/code`, `/app`, `/image-root`, `/.orryon`, or `/opt/orryon`.

### Step 2 — Fix the start command

**Settings** → **Deploy** → **Custom Start Command**:

```bash
sh /.orryon/backend/start.sh
```

Remove any value like `sh backend/start.sh` or `sh /image-root/backend/start.sh`.

### Step 3 — Variables

```
DB_PATH=/data/finance.db
NODE_ENV=production
JWT_SECRET=<64+ char random hex>
REQUEST_SIGNING_MODE=enforce
```

**Delete** `DATABASE_URL` if you are not using Postgres.

### Step 4 — Redeploy

Deployments → **Redeploy** → enable **Clear build cache** if available.

## Success looks like

```
=== orryon backend ORRYON_BOOT_v3 ===
ROOT=/.orryon
DB_PATH=/data/finance.db
Starting uvicorn on 0.0.0.0:8000 ...
```

If you still see `ROOT=/code` or `config.py missing at /code and /image-root`, the new image is **not** running — repeat Step 2 and redeploy with cache cleared.
