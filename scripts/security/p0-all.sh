#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
source "$(dirname "$0")/test-env.sh"

OUT="/tmp/opencode/p0-all.log"
mkdir -p /tmp/opencode
: >"$OUT"

# Os testes usam o mesmo IP de origem; limpa apenas os contadores efêmeros
# de rate limit para não transformar a suíte em um teste de bloqueio.
docker compose exec -T redis sh -c \
  "redis-cli --scan --pattern 'rl:*' | xargs -r redis-cli del" >/dev/null 2>&1 || true

run_node() {
  local script="$1" name="$2"
  if docker compose exec -T "${TEST_ENV[@]}" api node "${script}" >>"$OUT" 2>&1; then
    echo "PASS  ${name}" | tee -a "$OUT"
  else
    echo "FAIL  ${name}" | tee -a "$OUT"
    exit 1
  fi
}

run_node scripts/security-p0-authz.mjs "AX-001 autorização"
run_node scripts/security-p0-mfa.mjs "AX-007 MFA"

bash scripts/security/p0-radius.sh >>"$OUT" 2>&1 || { echo "FAIL  AX-006 expiração" | tee -a "$OUT"; exit 1; }
echo "PASS  AX-006 expiração" | tee -a "$OUT"

bash scripts/security/p0-sqli.sh >>"$OUT" 2>&1 || { echo "FAIL  AX-002 SQL injection" | tee -a "$OUT"; exit 1; }
echo "PASS  AX-002 SQL injection" | tee -a "$OUT"

bash scripts/security/p0-accounting.sh >>"$OUT" 2>&1 || { echo "FAIL  accounting" | tee -a "$OUT"; exit 1; }
echo "PASS  accounting" | tee -a "$OUT"

# Limpa o cache de clientes dinâmicos antes do probe de IP exato.
docker compose restart freeradius >>"$OUT" 2>&1 || true
for _ in $(seq 1 30); do
  docker compose logs --since 15s freeradius 2>/dev/null | grep -q "Ready to process requests" && break
  sleep 1
done
run_node scripts/security-p0-blast.mjs "AX-008 Blast-RADIUS"

bash scripts/security/check-artifacts.sh >>"$OUT" 2>&1 || { echo "FAIL  AX-003/AX-004 artefatos" | tee -a "$OUT"; exit 1; }
echo "PASS  AX-003/AX-004 artefatos" | tee -a "$OUT"

echo "RESULT  P0 aprovado (TLS separado: scripts/security/p0-tls.sh)" | tee -a "$OUT"
