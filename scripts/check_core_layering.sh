#!/usr/bin/env bash
# Fail if shared core/ imports FastAPI backend/ (layering violation).
#
# BEFORE Phase 1: violations are expected (exit 1). That does NOT mean Phase 0 failed.
#   Run: ./scripts/verify_phase0_baseline.sh   (should exit 0)
# AFTER Phase 1:  this script must exit 0; then wire it into CI.
#
# See docs/refactor-phase0-baseline.md

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if command -v rg >/dev/null 2>&1; then
  matches="$(rg '^\s*(from|import)\s+backend(\.|$)' core/ --glob '*.py' || true)"
else
  matches="$(grep -R -n -E '^[[:space:]]*(from|import)[[:space:]]+backend(\.|$)' core/ --include='*.py' 2>/dev/null || true)"
fi

if [[ -n "$matches" ]]; then
  count="$(printf '%s\n' "$matches" | grep -c . || true)"
  echo "Layering check: FAILED ($count import line(s) — fix in Phase 1)" >&2
  echo "" >&2
  echo "$matches" >&2
  echo "" >&2
  echo "This is EXPECTED before Phase 1. Phase 0 only documents the baseline." >&2
  echo "To confirm Phase 0 setup: ./scripts/verify_phase0_baseline.sh" >&2
  echo "Details: docs/refactor-phase0-baseline.md" >&2
  exit 1
fi

echo "OK: no core/ -> backend/ imports (ready for CI enforcement)"
