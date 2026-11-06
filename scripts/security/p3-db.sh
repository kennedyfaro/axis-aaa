#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
source "$(dirname "$0")/test-env.sh"

OUT="/tmp/opencode/p3-db.log"
mkdir -p /tmp/opencode
: >"$OUT"

HTTP_PORT="${HTTP_PORT:-8080}"
CSP_HEADER="$(curl -sSI "http://localhost:${HTTP_PORT}/" | tr -d '\r' | grep -i '^content-security-policy:' || true)"
[[ -n "$CSP_HEADER" ]] || { echo "FAIL  CSP ausente na resposta HTTP" | tee -a "$OUT"; exit 1; }
if grep -qi "unsafe-eval" <<<"$CSP_HEADER"; then
  echo "FAIL  CSP ainda permite unsafe-eval" | tee -a "$OUT"
  exit 1
fi
echo "PASS  CSP sem unsafe-eval" | tee -a "$OUT"

psql_scalar() {
  docker compose exec -T postgres psql -U aaa -d aaa_manager -At -c "$1"
}
pass() { echo "PASS  $1" | tee -a "$OUT"; }
fail() { echo "FAIL  $1" | tee -a "$OUT"; exit 1; }
check() {
  local expected="$1" value="$2" message="$3"
  [[ "$value" == "$expected" ]] || fail "$message (esperado=$expected, obtido=$value)"
  pass "$message"
}

check "t" "$(psql_scalar "select count(*) > 0 from information_schema.columns where table_name='admins' and column_name='tokenVersion'")" "admins.tokenVersion existe"
check "0" "$(psql_scalar "select count(*) from admins where \"totpSecret\" is not null and \"totpSecret\" not like 'enc:v1:%'")" "todos os segredos TOTP estão cifrados"
check "t" "$(psql_scalar "select has_column_privilege('aaa_worker','users','lastAuthAt','SELECT')")" "worker lê lastAuthAt"
check "t" "$(psql_scalar "select has_column_privilege('aaa_worker','users','lastAuthAt','UPDATE')")" "worker atualiza lastAuthAt"
check "f" "$(psql_scalar "select has_column_privilege('aaa_worker','users','radiusNtHash','SELECT')")" "worker não lê radiusNtHash"
check "f" "$(psql_scalar "select has_column_privilege('aaa_worker','users','radiusNtHash','UPDATE')")" "worker não altera radiusNtHash"
check "f" "$(psql_scalar "select has_column_privilege('aaa_worker','users','email','SELECT')")" "worker não lê e-mail"
check "t" "$(psql_scalar "select count(*) > 0 from pg_indexes where indexname='devices_nasIp_unique'")" "índice único de IP de device existe"
check "t" "$(psql_scalar "select count(*) > 0 from pg_indexes where indexname='nas_nasname_unique'")" "índice único de nasname existe"
check "0" "$(psql_scalar "select count(*) from (select \"nasIp\" from devices group by \"nasIp\" having count(*) > 1) x")" "não há IP de device duplicado"
check "0" "$(psql_scalar "select count(*) from (select nasname from nas group by nasname having count(*) > 1) x")" "não há nasname duplicado"

if docker inspect aaa-manager-api-1 --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | cut -d= -f1 | grep -qE '^(MIGRATE_DATABASE_URL|BOOTSTRAP_ADMIN_PASSWORD|BOOTSTRAP_ADMIN_TOTP_SECRET|POSTGRES_PASSWORD)$'; then
  fail "API runtime ainda recebe credencial/segredo proibido"
fi
pass "API runtime sem superusuário e sem segredos de bootstrap"

FREERAD_UID="$(docker compose exec -T freeradius id -u | tr -d '\r')"
check "101" "$FREERAD_UID" "FreeRADIUS roda como usuário freerad (não root)"

if docker compose exec -T api ./node_modules/.bin/tsx prisma/seed.ts > /tmp/opencode/p3-seed-guard.log 2>&1; then
  fail "seed destrutivo não foi bloqueado em produção"
fi
grep -q "Seed bloqueado" /tmp/opencode/p3-seed-guard.log || fail "mensagem do bloqueio de seed ausente"
pass "seed destrutivo é bloqueado em produção"

if docker compose exec -T api ./node_modules/.bin/tsx scripts/mfa-code.ts > /tmp/opencode/p3-mfa-code-guard.log 2>&1; then
  fail "mfa-code não foi bloqueado sem MFA_CODE_ALLOW"
fi
grep -q "mfa-code desabilitado" /tmp/opencode/p3-mfa-code-guard.log || fail "mensagem do bloqueio de mfa-code ausente"
pass "mfa-code exige MFA_CODE_ALLOW=true"

echo "RESULT  P3 AX-032/AX-035/AX-036/AX-037/AX-038/AX-039/AX-046 aprovado" | tee -a "$OUT"
