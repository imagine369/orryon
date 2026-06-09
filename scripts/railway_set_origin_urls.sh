#!/usr/bin/env bash
# Set FRONTEND_URL and APP_URL on the linked Railway backend service.
#
# Usage (from repo root):
#   railway login
#   railway link          # select your project + backend service
#   ./scripts/railway_set_origin_urls.sh
#
# Override defaults:
#   FRONTEND_URL=https://www.orryon.com APP_URL=https://www.orryon.com ./scripts/railway_set_origin_urls.sh

set -euo pipefail

FRONTEND_URL="${FRONTEND_URL:-https://www.orryon.com}"
APP_URL="${APP_URL:-https://www.orryon.com}"

if ! command -v railway >/dev/null 2>&1; then
  echo "railway CLI not found. Install: https://docs.railway.com/develop/cli"
  exit 1
fi

railway variables --set "FRONTEND_URL=${FRONTEND_URL}" --set "APP_URL=${APP_URL}"

echo "Set on linked Railway service:"
echo "  FRONTEND_URL=${FRONTEND_URL}"
echo "  APP_URL=${APP_URL}"
echo ""
echo "Redeploy the backend, then verify:"
echo "  VERIFY_PROD_URL=https://api.orryon.com .venv/bin/python scripts/verify_prod.py"
