#!/usr/bin/env bash
# Fail if tracked source files exceed the team line cap (default 400).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MAX_LINES="${ORRYON_MAX_FILE_LINES:-400}"
ALLOWLIST="$ROOT/scripts/file-length-allowlist.txt"

is_allowlisted() {
  local rel="$1"
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%%#*}"
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    [ -z "$line" ] && continue
    if [[ "$rel" == "$line" ]] || [[ "$rel" == *"$line" ]]; then
      return 0
    fi
  done < "$ALLOWLIST"
  return 1
}

violations=0
while IFS= read -r -d '' file; do
  rel="${file#$ROOT/}"
  if is_allowlisted "$rel"; then
    continue
  fi
  lines=$(wc -l < "$file" | tr -d ' ')
  if [ "$lines" -gt "$MAX_LINES" ]; then
    echo "OVER LIMIT ($lines > $MAX_LINES): $rel"
    violations=$((violations + 1))
  fi
done < <(
  find "$ROOT/frontend/src" "$ROOT/core" "$ROOT/backend" \
    \( -name '*.ts' -o -name '*.tsx' -o -name '*.py' \) \
    ! -path '*/node_modules/*' \
    -print0 2>/dev/null
)

if [ "$violations" -gt 0 ]; then
  echo ""
  echo "Found $violations file(s) over ${MAX_LINES} lines."
  echo "Split new logic into focused modules, or add a documented exception to scripts/file-length-allowlist.txt"
  exit 1
fi

echo "OK: no non-allowlisted source files over ${MAX_LINES} lines"
