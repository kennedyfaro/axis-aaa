#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
source "$(dirname "$0")/test-env.sh"

OUT="/tmp/opencode/p0-tls.log"
mkdir -p /tmp/opencode
docker compose exec -T redis sh -c \
  "redis-cli --scan --pattern 'rl:*' | xargs -r redis-cli del" >/dev/null 2>&1 || true

if docker compose exec -T "${TEST_ENV[@]}" api node scripts/security-p0-tls.mjs >>"$OUT" 2>&1; then
  echo "PASS  AX-005 TLS/HSTS/cookies" | tee -a "$OUT"
else
  echo "FAIL  AX-005 TLS/HSTS/cookies (suba a stack com docker-compose.prod.yml)" | tee -a "$OUT"
  exit 1
fi
