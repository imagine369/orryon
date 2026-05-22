#!/bin/sh
set -e

# Fixed path from Docker image — not affected by volumes mounted at /app or /opt/orryon
ROOT="${APP_ROOT:-/usr/local/lib/orryon}"
cd "$ROOT"
export PYTHONPATH="${PYTHONPATH:-$ROOT}"

echo "=== orryon backend starting ==="
echo "ROOT=${ROOT}"
echo "PORT=${PORT:-8000}"
echo "PYTHONPATH=${PYTHONPATH}"
echo "Python: $(python --version 2>&1)"

if [ ! -f "${ROOT}/config.py" ]; then
  echo "ERROR: ${ROOT}/config.py is missing — image build is broken."
  exit 1
fi

# Ensure database directory exists and is writable; fall back to app dir for SQLite
DB_PATH_VAL="${DB_PATH:-/data/finance.db}"
DB_DIR="$(dirname "$DB_PATH_VAL")"
mkdir -p "$DB_DIR" /data 2>/dev/null || true
if [ ! -d "$DB_DIR" ] || [ ! -w "$DB_DIR" ]; then
  echo "WARN: ${DB_DIR} not writable — using ${ROOT}/finance.db (set volume mount to /data)"
  export DB_PATH="${ROOT}/finance.db"
  DB_DIR="${ROOT}"
fi
echo "DB_PATH=${DB_PATH:-/data/finance.db}"

echo "NODE_ENV=${NODE_ENV:-(unset)}"
echo "DATABASE_URL=${DATABASE_URL:-(unset — SQLite)}"

# Skip slow preflight — uvicorn import will surface errors in logs
WORKERS=1
if [ -n "${DATABASE_URL:-}" ]; then
  WORKERS="${WEB_CONCURRENCY:-1}"
fi
echo "Starting uvicorn on 0.0.0.0:${PORT:-8000} (workers=${WORKERS})..."
exec uvicorn backend.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers "${WORKERS}"
