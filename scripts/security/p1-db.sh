#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

OUT="/tmp/opencode/p1-db.log"
mkdir -p /tmp/opencode
: >"$OUT"

psql_scalar() {
  docker compose exec -T postgres psql -U aaa -d aaa_manager -At -c "$1"
}

pass() {
  echo "PASS  $1" | tee -a "$OUT"
}

fail() {
  echo "FAIL  $1" | tee -a "$OUT"
  exit 1
}

check() {
  local expected="$1" value="$2" message="$3"
  [[ "$value" == "$expected" ]] || fail "$message (esperado=$expected, obtido=$value)"
  pass "$message"
}

check "f" "$(psql_scalar "select rolsuper from pg_roles where rolname='aaa_app'")" "aaa_app não é superusuário"
check "f" "$(psql_scalar "select rolsuper from pg_roles where rolname='aaa_worker'")" "aaa_worker não é superusuário"
check "f" "$(psql_scalar "select rolsuper from pg_roles where rolname='aaa_radius'")" "aaa_radius não é superusuário"
check "f" "$(psql_scalar "select has_column_privilege('aaa_app','nas','secret','SELECT')")" "aaa_app não lê nas.secret"
check "t" "$(psql_scalar "select has_column_privilege('aaa_app','nas','nasname','SELECT')")" "aaa_app lê metadados do NAS"
check "f" "$(psql_scalar "select has_column_privilege('aaa_radius','users','radiusNtHash','SELECT')")" "aaa_radius não lê hashes de senha"
check "t" "$(psql_scalar "select has_column_privilege('aaa_radius','users','login','SELECT')")" "aaa_radius lê colunas de validade/login"
check "t" "$(psql_scalar "select has_column_privilege('aaa_radius','nas','secret','SELECT')")" "aaa_radius lê o segredo do NAS"
check "f" "$(psql_scalar "select has_table_privilege('aaa_worker','nas','SELECT')")" "aaa_worker não acessa a tabela nas"
check "f" "$(psql_scalar "select has_table_privilege('aaa_app','audit_events','DELETE')")" "aaa_app não apaga auditoria"
check "t" "$(psql_scalar "select has_table_privilege('aaa_app','audit_events','INSERT')")" "aaa_app insere auditoria"
check "t" "$(psql_scalar "select has_table_privilege('aaa_radius','radacct','INSERT')")" "aaa_radius insere accounting"
check "t" "$(psql_scalar "select has_table_privilege('aaa_radius','radacct','UPDATE')")" "aaa_radius atualiza accounting"
check "f" "$(psql_scalar "select has_table_privilege('aaa_radius','radacct','DELETE')")" "aaa_radius não apaga accounting"
check "t" "$(psql_scalar "select has_table_privilege('aaa_radius','radpostauth','INSERT')")" "aaa_radius insere autenticações"
check "t" "$(psql_scalar "select prosecdef from pg_proc where proname='audit_radius_postauth'")" "trigger postauth é SECURITY DEFINER"
check "t" "$(psql_scalar "select prosecdef from pg_proc where proname='audit_radius_acct'")" "trigger accounting é SECURITY DEFINER"

if docker compose exec -T postgres psql -U aaa -d aaa_manager -v ON_ERROR_STOP=1 \
  -c "SET ROLE aaa_app; CREATE TABLE p1_should_fail(id int);" >/dev/null 2>&1; then
  fail "aaa_app conseguiu criar tabela"
fi
pass "aaa_app não pode criar tabela"

if docker compose exec -T postgres psql -U aaa -d aaa_manager -v ON_ERROR_STOP=1 \
  -c "SET ROLE aaa_app; SELECT secret FROM nas;" >/dev/null 2>&1; then
  fail "aaa_app conseguiu ler nas.secret"
fi
pass "aaa_app não consegue ler nas.secret via SQL"

if docker compose exec -T postgres psql -U aaa -d aaa_manager -v ON_ERROR_STOP=1 \
  -c "SET ROLE aaa_radius; SELECT \"radiusNtHash\" FROM users LIMIT 1;" >/dev/null 2>&1; then
  fail "aaa_radius conseguiu ler hash de senha"
fi
pass "aaa_radius não consegue ler hash de senha via SQL"

echo "RESULT  P1 AX-010 aprovado" | tee -a "$OUT"
