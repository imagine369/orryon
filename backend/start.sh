#!/bin/sh
set -e
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

# Workers: use WEB_CONCURRENCY env var, default to 4 in production, 1 in dev
WORKERS=${WEB_CONCURRENCY:-${NODE_ENV:+4}}
WORKERS=${WORKERS:-1}

echo "Starting uvicorn (workers=${WORKERS})..."
exec uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers ${WORKERS}
