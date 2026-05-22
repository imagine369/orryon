#!/bin/sh
set -e

PRIMARY="${APP_ROOT:-/code}"
STASH="/image-root"

# Railway volumes are often mounted on /app, /code, or /opt/orryon — that hides image files.
# Fall back to the immutable build-time copy so the process can still start.
if [ ! -f "${PRIMARY}/config.py" ] && [ -f "${STASH}/config.py" ]; then
  echo "WARN: ${PRIMARY} has no config.py (volume likely mounted over app code)."
  echo "WARN: Running from ${STASH} instead. Set volume Mount Path to /data ONLY."
  PRIMARY="${STASH}"
fi

cd "$PRIMARY"
export PYTHONPATH="${PYTHONPATH:-$PRIMARY}"

echo "=== orryon backend starting ==="
echo "ROOT=${PRIMARY}"
echo "PORT=${PORT:-8000}"
echo "PYTHONPATH=${PYTHONPATH}"
echo "Python: $(python --version 2>&1)"

if [ ! -f "${PRIMARY}/config.py" ]; then
  echo "ERROR: config.py missing at ${PRIMARY} and ${STASH}."
  echo "Fix Railway: Storage -> orryon-volume -> Mount Path = /data (not /code, /app, /opt/orryon)."
  ls -la "${PRIMARY}" 2>/dev/null | head -15 || true
  exit 1
fi

# Database always on the volume mount, never inside app code
DB_PATH_VAL="${DB_PATH:-/data/finance.db}"
DB_DIR="$(dirname "$DB_PATH_VAL")"
mkdir -p "$DB_DIR" 2>/dev/null || true
if [ ! -d "$DB_DIR" ] || [ ! -w "$DB_DIR" ]; then
  echo "ERROR: database directory not writable: ${DB_DIR}"
  echo "Mount orryon-volume at /data and set DB_PATH=/data/finance.db"
  exit 1
fi
echo "DB_PATH=${DB_PATH_VAL}"

echo "NODE_ENV=${NODE_ENV:-(unset)}"
echo "DATABASE_URL=${DATABASE_URL:-(unset — SQLite)}"

WORKERS=1
if [ -n "${DATABASE_URL:-}" ]; then
  WORKERS="${WEB_CONCURRENCY:-1}"
fi
echo "Starting uvicorn on 0.0.0.0:${PORT:-8000} (workers=${WORKERS})..."
exec uvicorn backend.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers "${WORKERS}"
