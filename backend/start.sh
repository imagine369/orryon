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
try:
    import backend.main
    print('All imports OK')
except Exception as e:
    print(f'IMPORT ERROR: {e}')
    import traceback
    traceback.print_exc()
    exit(1)
"

# Single worker by default — multi-worker duplicates lifespan (DB pool, scheduler) and
# often fails Railway healthchecks on small instances. Override with WEB_CONCURRENCY if needed.
WORKERS="${WEB_CONCURRENCY:-1}"

echo "Starting uvicorn (workers=${WORKERS})..."
exec uvicorn backend.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers "${WORKERS}"
