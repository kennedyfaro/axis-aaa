#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

OUT="/tmp/opencode/p2-all.log"
mkdir -p /tmp/opencode
: >"$OUT"

pass() { echo "PASS  $1" | tee -a "$OUT"; }
fail() { echo "FAIL  $1" | tee -a "$OUT"; exit 1; }

wait_radius() {
  local attempt
  for attempt in $(seq 1 30); do
    if docker compose logs --since 15s freeradius 2>/dev/null | grep -q "Ready to process requests"; then
      return 0
    fi
    sleep 1
  done
  return 1
}

source "$(dirname "$0")/test-env.sh"

docker compose exec -T redis sh -c \
  "redis-cli --scan --pattern 'rl:*' | xargs -r redis-cli del" >/dev/null 2>&1 || true

run_api_script() {
  local script="$1" name="$2" phase="${3:-}"
  local env_args=()
  if [[ -n "$phase" ]]; then
    env_args=(-e "SECURITY_TEST_PHASE=$phase")
  fi
  if docker compose run --rm --no-deps "${env_args[@]}" "${TEST_ENV[@]}" \
    -v "$PWD/apps/api/scripts:/app/apps/api/scripts:ro" \
    --entrypoint node api "scripts/${script}" >>"$OUT" 2>&1; then
    pass "$name"
  else
    fail "$name"
  fi
}

run_api_script security-p2-web.mjs "AX-018/AX-020/AX-021/AX-025/AX-026/AX-027 web"

if docker compose run --rm -e WORKER_ONCE=security-alerts worker >>"$OUT" 2>&1; then
  ALERT_COUNT="$(docker compose exec -T postgres psql -U aaa -d aaa_manager -At \
    -c "select count(*) from notifications where title like 'Alerta:%'")"
  [[ "$ALERT_COUNT" -ge 1 ]] || fail "worker não criou alerta de segurança"
  pass "AX-028 worker cria alerta de segurança ($ALERT_COUNT)"
  docker compose exec -T postgres psql -U aaa -d aaa_manager -q \
    -c "delete from notifications where title like 'Alerta:%'" >/dev/null 2>&1 || true
else
  fail "AX-028 worker de alertas"
fi

# O cache de clientes dinâmicos do FreeRADIUS dura 60s. Reinicia entre as
# fases para que o probe negativo não contamine o probe positivo.
docker compose restart freeradius >>"$OUT" 2>&1 || fail "restart do FreeRADIUS"
wait_radius || fail "FreeRADIUS não ficou pronto (fase unknown)"
run_api_script security-p2-radius.mjs "AX-020 RADIUS rejeita IP desconhecido" unknown
docker compose restart freeradius >>"$OUT" 2>&1 || fail "restart do FreeRADIUS"
wait_radius || fail "FreeRADIUS não ficou pronto (fase exact)"
run_api_script security-p2-radius.mjs "AX-020 RADIUS aceita IP exato" exact

bash scripts/security/p2-db.sh >>"$OUT" 2>&1 || fail "AX-020/AX-023/AX-025/AX-026 banco"
pass "AX-020/AX-023/AX-025/AX-026 banco"

bash scripts/security/p2-hardening.sh >>"$OUT" 2>&1 || fail "AX-020/AX-024/AX-026/AX-028 hardening"
pass "AX-020/AX-024/AX-026/AX-028 hardening"

bash scripts/security/p1-deps.sh >>"$OUT" 2>&1 || fail "AX-019 dependências e testes unitários"
pass "AX-019 dependências e testes unitários"

echo "RESULT  P2 aprovado" | tee -a "$OUT"
