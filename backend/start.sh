#!/bin/sh
set -e
cd /app
export PYTHONPATH="${PYTHONPATH:-/app}"
echo "=== orryon backend starting ==="
echo "PORT=${PORT:-8000}"
echo "PYTHONPATH=${PYTHONPATH}"
echo "Python: $(python --version)"
if [ ! -f "${PYTHONPATH}/config.py" ]; then
  echo "ERROR: ${PYTHONPATH}/config.py is missing."
  echo "If a Railway volume is mounted at /app, change the mount path to /data only (DB_PATH=/data/finance.db)."
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
        print('Fix: link Railway Postgres and set DATABASE_URL from the service reference,')
        print('     OR unset DATABASE_URL and use SQLite with DB_PATH=/data/finance.db + volume at /data.')
        sys.exit(1)
    finally:
        close_pool()
else:
    print(f'Database mode: SQLite ({db_path})')
    if db_path.startswith('/data') and not os.path.isdir('/data'):
        print('WARNING: /data does not exist — attach a Railway volume mounted at /data')
"

# Single worker by default — multi-worker duplicates lifespan (DB pool, scheduler) and
# often fails Railway healthchecks on small instances. Override with WEB_CONCURRENCY if needed.
WORKERS="${WEB_CONCURRENCY:-1}"

echo "Starting uvicorn (workers=${WORKERS})..."
exec uvicorn backend.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers "${WORKERS}"
