#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

OUT="/tmp/opencode/p2-db.log"
mkdir -p /tmp/opencode
: >"$OUT"

psql_scalar() {
  docker compose exec -T postgres psql -U aaa -d aaa_manager -At -c "$1"
}

psql_exec() {
  docker compose exec -T postgres psql -U aaa -d aaa_manager -v ON_ERROR_STOP=1 -c "$1" >>"$OUT" 2>&1
}

pass() { echo "PASS  $1" | tee -a "$OUT"; }
fail() { echo "FAIL  $1" | tee -a "$OUT"; exit 1; }

check() {
  local expected="$1" value="$2" message="$3"
  [[ "$value" == "$expected" ]] || fail "$message (esperado=$expected, obtido=$value)"
  pass "$message"
}

check "f" "$(psql_scalar "select rolsuper from pg_roles where rolname='aaa_app'")" "aaa_app não é superusuário"
check "f" "$(psql_scalar "select rolsuper from pg_roles where rolname='aaa_worker'")" "aaa_worker não é superusuário"
check "f" "$(psql_scalar "select rolsuper from pg_roles where rolname='aaa_radius'")" "aaa_radius não é superusuário"
check "t" "$(psql_scalar "select has_table_privilege('aaa_worker','audit_events','SELECT')")" "aaa_worker lê auditoria para alertas"
check "f" "$(psql_scalar "select has_table_privilege('aaa_app','audit_events','UPDATE')")" "aaa_app não altera auditoria"
check "f" "$(psql_scalar "select has_table_privilege('aaa_app','audit_events','DELETE')")" "aaa_app não apaga auditoria"
check "t" "$(psql_scalar "select count(*) > 0 from pg_trigger where tgname='audit_events_no_truncate'")" "trigger de TRUNCATE existe"
check "0" "$(psql_scalar "select count(*) from information_schema.columns where table_name='nas' and column_name='secret' and column_default is not null")" "nas.secret não tem default"
check "0" "$(psql_scalar "select count(*) from nas where secret in ('secret','testing123')")" "nenhum NAS usa segredo default conhecido"
check "t" "$(psql_scalar "select coalesce(min(char_length(secret)),8) >= 8 from nas")" "nenhum segredo NAS está vazio ou truncado"
source .env
if [[ "${RADIUS_ALLOW_WILDCARD_NAS:-false}" == "true" ]]; then
  check "t" "$(psql_scalar "select count(*) <= 1 from nas where nasname = '0.0.0.0/0'")" "no máximo um NAS curinga cadastrado"
else
  check "0" "$(psql_scalar "select count(*) from nas where nasname = '0.0.0.0/0'")" "NAS curinga 0.0.0.0/0 está desabilitado"
fi
check "t" "$(psql_scalar "select count(*) >= 5 from nas")" "NAS reais foram migrados do curinga para IP exato"
check "t" "$(psql_scalar "select count(*) >= 5 from devices where \"nasIp\" <> '0.0.0.0/0'")" "devices reais foram criados para os NAS exatos"
check "t" "$(psql_scalar "select coalesce(bool_and(status='BLOCKED' and \"radiusNtHash\" is null), true) from users where login='radius.test'")" "radius.test permanece bloqueado e sem hash"
check "0" "$(psql_scalar "select count(*) from radcheck where username='radius.test' and attribute='NT-Password'")" "radius.test não tem credencial RADIUS válida"
check "t" "$(psql_scalar "select coalesce(bool_and(attribute='Auth-Type' and value='Reject'), true) from radcheck where username='radius.test'")" "radius.test só tem entrada de rejeição"

# AX-023: nem a API nem o owner conseguem truncar a auditoria.
BEFORE="$(psql_scalar "select count(*) from audit_events")"
if docker compose exec -T postgres psql -U aaa -d aaa_manager -v ON_ERROR_STOP=1 \
  -c "SET ROLE aaa_app; TRUNCATE audit_events;" >/dev/null 2>&1; then
  fail "aaa_app conseguiu truncar audit_events"
fi
pass "aaa_app não pode truncar audit_events"
if docker compose exec -T postgres psql -U aaa -d aaa_manager -v ON_ERROR_STOP=1 \
  -c "TRUNCATE audit_events;" >/dev/null 2>&1; then
  fail "owner conseguiu truncar audit_events"
fi
pass "owner é bloqueado pelo trigger de TRUNCATE"
AFTER="$(psql_scalar "select count(*) from audit_events")"
check "$BEFORE" "$AFTER" "auditoria permanece intacta após tentativas de TRUNCATE"

echo "RESULT  P2 AX-020/AX-023/AX-025/AX-026 aprovado" | tee -a "$OUT"
