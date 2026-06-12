#!/usr/bin/env bash
# Start production Next.js server, wait for /home, then run E2E command(s).
# Usage: ./scripts/run-e2e-with-server.sh npm run test:quick-access:e2e
set -euo pipefail

PORT="${E2E_PORT:-3456}"
BASE="${TEST_BASE_URL:-http://127.0.0.1:${PORT}}"
export TEST_BASE_URL="$BASE"

cd "$(dirname "$0")/.."

npm run start -- -p "$PORT" &
SERVER_PID=$!
cleanup() { kill "$SERVER_PID" 2>/dev/null || true; }
trap cleanup EXIT

echo "Waiting for ${BASE}/home ..."
for _ in $(seq 1 30); do
  if curl -sf "${BASE}/home" >/dev/null; then
    break
  fi
  sleep 2
done
curl -sf "${BASE}/home" >/dev/null

exec "$@"
