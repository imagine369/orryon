#!/bin/sh
set -e

# Repo root = parent of backend/ (works in Docker /app and legacy /opt/orryon images)
ROOT="${APP_ROOT:-$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)}"
cd "$ROOT"
export PYTHONPATH="${PYTHONPATH:-$ROOT}"

echo "=== orryon backend starting ==="
echo "ROOT=${ROOT}"
echo "PORT=${PORT:-8000}"
echo "PYTHONPATH=${PYTHONPATH}"
echo "Python: $(python --version)"

if [ ! -f "${ROOT}/config.py" ]; then
  echo "ERROR: ${ROOT}/config.py is missing."
  echo "Your Railway volume is mounted over the application directory."
  echo "Fix: open orryon-volume -> Mount Path = /data ONLY (not /app, /opt/orryon, /srv/orryon)."
  exit 1
fi

DB_PATH_VAL="${DB_PATH:-/data/finance.db}"
DB_DIR="$(dirname "$DB_PATH_VAL")"
mkdir -p "$DB_DIR" /data 2>/dev/null || true
if [ ! -d "$DB_DIR" ] || [ ! -w "$DB_DIR" ]; then
  echo "ERROR: database directory is not writable: $DB_DIR"
  echo "Mount orryon-volume at /data and set DB_PATH=/data/finance.db"
  exit 1
fi

echo "Testing imports..."
python -c "
import os
import sys

try:
    import backend.main
    print('All imports OK')
except Exception as e:
    print(f'IMPORT ERROR: {e}')
    import traceback
    traceback.print_exc()
    sys.exit(1)

db_url = os.getenv('DATABASE_URL', '').strip()
db_path = os.getenv('DB_PATH', 'finance.db')
if db_url:
    print('Database mode: Postgres (DATABASE_URL is set)')
    from db.connection import init_pool, close_pool
    try:
        init_pool()
        print('Postgres connection: OK')
    except Exception as exc:
        if os.getenv('DB_PATH', '').strip():
            print('WARN: Postgres unreachable; will fall back to SQLite at', db_path)
            print(exc)
        else:
            print('FATAL: DATABASE_URL is set but Postgres is not reachable.')
            print('Unset DATABASE_URL or set DB_PATH=/data/finance.db for SQLite.')
            print(exc)
            sys.exit(1)
    finally:
        close_pool()
else:
    print(f'Database mode: SQLite ({db_path})')
"

# SQLite cannot use multiple workers (file locks). Force 1 unless Postgres is configured.
if [ -n "${DATABASE_URL:-}" ]; then
  WORKERS="${WEB_CONCURRENCY:-1}"
else
  WORKERS=1
fi
echo "NODE_ENV=${NODE_ENV:-(unset)}"
echo "DATABASE_URL=${DATABASE_URL:-(unset — SQLite)}"
echo "DB_PATH=${DB_PATH:-finance.db}"
echo "Starting uvicorn (workers=${WORKERS})..."
exec uvicorn backend.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers "${WORKERS}"
