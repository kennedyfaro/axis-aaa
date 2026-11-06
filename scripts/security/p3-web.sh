#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
source "$(dirname "$0")/test-env.sh"

OUT="/tmp/opencode/p3-web.log"
mkdir -p /tmp/opencode

if docker compose run --rm --no-deps "${TEST_ENV[@]}" \
  -v "$PWD/apps/api/scripts:/app/apps/api/scripts:ro" \
  --entrypoint node api scripts/security-p3-web.mjs \
  | tee "$OUT"; then
  echo "PASS  AX-029/030/031/035/043"
else
  echo "FAIL  testes P3 Bloco A"
  exit 1
fi
