#!/bin/sh
set -e

# Always run from the immutable image copy — never from /code (Railway volumes often mount there).
ROOT="/image-root"
cd "$ROOT"
export PYTHONPATH="$ROOT"

echo "=== orryon backend starting ==="
echo "ROOT=${ROOT}"
echo "PORT=${PORT:-8000}"
echo "PYTHONPATH=${PYTHONPATH}"
echo "Python: $(python --version 2>&1)"

if [ ! -f "${ROOT}/config.py" ]; then
  echo "ERROR: ${ROOT}/config.py missing — Docker image did not build correctly."
  exit 1
fi

# Pick first writable SQLite location (prefer persistent /data volume)
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
  echo "Mount orryon-volume at /data and set DB_PATH=/data/finance.db"
  exit 1
fi
export DB_PATH="$DB_PATH_VAL"
echo "DB_PATH=${DB_PATH}"
if [ "$(dirname "$DB_PATH")" != "/data" ]; then
  echo "WARN: SQLite is not on /data — set volume Mount Path=/data and DB_PATH=/data/finance.db for persistence."
fi

echo "NODE_ENV=${NODE_ENV:-(unset)}"
echo "DATABASE_URL=${DATABASE_URL:-(unset — SQLite)}"

WORKERS=1
if [ -n "${DATABASE_URL:-}" ]; then
  WORKERS="${WEB_CONCURRENCY:-1}"
fi
echo "Starting uvicorn on 0.0.0.0:${PORT:-8000} (workers=${WORKERS})..."
exec uvicorn backend.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers "${WORKERS}"
