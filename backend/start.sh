#!/bin/sh
set -e
cd /srv/orryon
export PYTHONPATH="${PYTHONPATH:-/srv/orryon}"
echo "=== orryon backend starting ==="
echo "PORT=${PORT:-8000}"
echo "PYTHONPATH=${PYTHONPATH}"
echo "Python: $(python --version)"

if [ ! -f "${PYTHONPATH}/config.py" ]; then
  echo "ERROR: ${PYTHONPATH}/config.py is missing."
  echo "If a Railway volume is mounted at /app or /srv/orryon, remount it at /data only."
  exit 1
fi

# SQLite DB lives on the volume (mount orryon-volume at /data).
mkdir -p /data
if [ ! -d /data ] || [ ! -w /data ]; then
  echo "ERROR: /data is not writable — mount orryon-volume at /data (not /app)."
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
        print('FATAL: DATABASE_URL is set but Postgres is not reachable.')
        print(exc)
        print('Fix: add Railway Postgres and reference its DATABASE_URL,')
        print('     OR unset DATABASE_URL and use DB_PATH=/data/finance.db + volume at /data.')
        sys.exit(1)
    finally:
        close_pool()
else:
    print(f'Database mode: SQLite ({db_path})')
    parent = os.path.dirname(db_path) or '.'
    if parent and parent != '.' and not os.path.isdir(parent):
        print(f'ERROR: database directory {parent!r} does not exist')
        sys.exit(1)
"

WORKERS="${WEB_CONCURRENCY:-1}"
echo "Starting uvicorn (workers=${WORKERS})..."
exec uvicorn backend.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers "${WORKERS}"
