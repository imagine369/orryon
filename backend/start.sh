#!/bin/sh
set -e

# ORRYON_BOOT_v3 — if logs do not show this, Railway is running an old start command/image.
ROOT="/.orryon"
cd "$ROOT"
export PYTHONPATH="$ROOT"
unset APP_ROOT

echo "=== orryon backend ORRYON_BOOT_v3 ==="
echo "ROOT=${ROOT}"
echo "PORT=${PORT:-8000}"
echo "PYTHONPATH=${PYTHONPATH}"
echo "Python: $(python --version 2>&1)"

if [ ! -f "${ROOT}/config.py" ]; then
  echo "ERROR: ${ROOT}/config.py missing — rebuild the Docker image."
  exit 1
fi

# SQLite: prefer /data volume, then /tmp, then app dir
if [ -n "${DB_PATH:-}" ]; then
  _db_candidates="${DB_PATH}"
else
  _db_candidates="/data/finance.db /tmp/orryon/finance.db ${ROOT}/finance.db"
fi
DB_PATH_VAL=""
for candidate in $_db_candidates; do
  _dir="$(dirname "$candidate")"
  mkdir -p "$_dir" 2>/dev/null || true
  if [ -d "$_dir" ] && [ -w "$_dir" ]; then
    DB_PATH_VAL="$candidate"
    break
  fi
done
if [ -z "$DB_PATH_VAL" ]; then
  echo "ERROR: no writable directory for SQLite."
  echo "Set volume Mount Path=/data and DB_PATH=/data/finance.db"
  exit 1
fi
export DB_PATH="$DB_PATH_VAL"
echo "DB_PATH=${DB_PATH}"
if [ "$(dirname "$DB_PATH")" != "/data" ]; then
  echo "NOTICE: DB_PATH is not on /data (${DB_PATH}) — for Railway persistence, mount a volume at /data and set DB_PATH=/data/finance.db"
fi

echo "NODE_ENV=${NODE_ENV:-(unset)}"
echo "DATABASE_URL=${DATABASE_URL:-(unset — SQLite)}"

WORKERS=1
if [ -n "${DATABASE_URL:-}" ]; then
  WORKERS="${WEB_CONCURRENCY:-1}"
fi
echo "Starting uvicorn on 0.0.0.0:${PORT:-8000} (workers=${WORKERS})..."
exec uvicorn backend.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers "${WORKERS}"
