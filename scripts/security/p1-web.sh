#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
source "$(dirname "$0")/test-env.sh"

OUT="/tmp/opencode/p1-web.log"
mkdir -p /tmp/opencode

# O rootfs da API é read-only; montamos o script de teste apenas para leitura.
if docker compose run --rm --no-deps "${TEST_ENV[@]}" \
  -v "$PWD/apps/api/scripts:/app/apps/api/scripts:ro" \
  --entrypoint node api scripts/security-p1-web.mjs \
  | tee "$OUT"; then
  echo "PASS  AX-009/011/012/013/014/015/016"
else
  echo "FAIL  testes web P1"
  exit 1
fi
