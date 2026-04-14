#!/bin/sh
set -e
echo "=== orryon backend starting ==="
echo "PORT=${PORT:-8000}"
echo "Python: $(python --version)"
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
echo "Starting uvicorn..."
exec uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}
