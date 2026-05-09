#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "Checking for type drift..."

# Save current generated files
TEMP_DIR="$(mktemp -d)"
cp -r "${REPO_ROOT}/policies/schemas/" "${TEMP_DIR}/schemas" 2>/dev/null || true
cp "${REPO_ROOT}/packages/kirakirad/internal/types/generated.go" "${TEMP_DIR}/generated.go" 2>/dev/null || true
cp "${REPO_ROOT}/packages/model-gateway/src/kirakira_model_gateway/policy_types.py" "${TEMP_DIR}/policy_types.py" 2>/dev/null || true

# Regenerate
npx tsx "${SCRIPT_DIR}/generate-types.ts"

# Compare
DRIFT=0
if [ -d "${TEMP_DIR}/schemas" ] && [ "$(find "${TEMP_DIR}/schemas" -type f | wc -l)" -gt 0 ]; then
  if ! diff -qr "${TEMP_DIR}/schemas" "${REPO_ROOT}/policies/schemas/" >/dev/null 2>&1; then
    echo "DRIFT: JSON schemas have changed"
    DRIFT=1
  fi
else
  if [ ! -d "${REPO_ROOT}/policies/schemas" ] || [ -z "$(find "${REPO_ROOT}/policies/schemas" -maxdepth 1 -name '*.schema.json' -print -quit)" ]; then
    echo "DRIFT: JSON schemas directory missing"
    DRIFT=1
  fi
fi

if [ -f "${TEMP_DIR}/generated.go" ]; then
  if ! diff -q "${TEMP_DIR}/generated.go" "${REPO_ROOT}/packages/kirakirad/internal/types/generated.go" >/dev/null 2>&1; then
    echo "DRIFT: Go types have changed"
    DRIFT=1
  fi
fi

if [ -f "${TEMP_DIR}/policy_types.py" ]; then
  if ! diff -q "${TEMP_DIR}/policy_types.py" "${REPO_ROOT}/packages/model-gateway/src/kirakira_model_gateway/policy_types.py" >/dev/null 2>&1; then
    echo "DRIFT: Python types have changed"
    DRIFT=1
  fi
fi

rm -rf "${TEMP_DIR}"

if [ "${DRIFT}" -eq 1 ]; then
  echo "Type drift detected! Regenerate with: npx tsx scripts/generate-types.ts"
  exit 1
fi

echo "No type drift detected."
