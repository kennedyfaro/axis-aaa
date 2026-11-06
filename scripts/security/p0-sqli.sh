#!/usr/bin/env bash
set -euo pipefail
umask 077

cd "$(dirname "$0")/../.."

source "$(dirname "$0")/test-env.sh"
: "${RADIUS_CLIENT_SECRET:?defina RADIUS_CLIENT_SECRET no .env}"

LOGIN="sec.radius.$(date +%s)"
PASSWORD="SecuritySqli!2026#P0"
OUT="/tmp/opencode/p0-sqli-${LOGIN}.log"
mkdir -p /tmp/opencode

fail() {
  echo "FAIL  $1" >>"$OUT"
  exit 1
}

cleanup() {
  docker compose exec -T "${TEST_ENV[@]}" -e SECURITY_TEST_ACTION=cleanup \
    api node scripts/security-p0-radius.mjs >>"$OUT" 2>&1 || true
}
trap cleanup EXIT

SECURITY_TEST_ACTION=create \
SECURITY_TEST_LOGIN="$LOGIN" \
SECURITY_TEST_PASSWORD="$PASSWORD" \
  docker compose exec -T "${TEST_ENV[@]}" \
    -e SECURITY_TEST_ACTION \
    -e SECURITY_TEST_LOGIN \
    -e SECURITY_TEST_PASSWORD \
    api node scripts/security-p0-radius.mjs >>"$OUT" 2>&1

printf 'User-Name = "%s"\nUser-Password = "%s"\nNAS-Identifier = "x%c OR %c1%c=%c1"\nService-Type = Framed-User\n' \
  "$LOGIN" "$PASSWORD" "'" "'" "'" "'" > /tmp/opencode/p0-sqli-packet.txt

docker compose cp /tmp/opencode/p0-sqli-packet.txt \
  freeradius:/tmp/p0-sqli-packet.txt >>"$OUT" 2>&1
docker compose exec -T -u 0 freeradius chmod 644 /tmp/p0-sqli-packet.txt >>"$OUT" 2>&1

if ! docker compose exec -T freeradius \
  radclient -x -f /tmp/p0-sqli-packet.txt 127.0.0.1:1812 auth "$RADIUS_CLIENT_SECRET" \
  >>"$OUT" 2>&1; then
  fail "radclient com NAS-Identifier malicioso não foi aceito"
fi
if ! grep -q "Access-Accept" "$OUT"; then
  fail "NAS-Identifier malicioso impediu a autenticação legítima"
fi
echo "PASS  NAS-Identifier malicioso não alterou a consulta SQL" >>"$OUT"

NASID="$(docker compose exec -T postgres psql -U aaa -d aaa_manager -At \
  -c "select coalesce(nasidentifier, '<null>') from radpostauth where username='$LOGIN' order by id desc limit 1")"
if [[ "$NASID" == *" OR "* ]] || [[ "$NASID" == *"'"* ]]; then
  fail "NAS-Identifier malicioso foi persistido"
fi
echo "PASS  NAS-Identifier não foi interpolado no radpostauth (valor=$NASID)" >>"$OUT"

docker compose exec -T freeradius \
  radtest -t mschap "x' OR '1'='1" "whatever" 127.0.0.1 0 "$RADIUS_CLIENT_SECRET" \
  >>"$OUT" 2>&1 || true
if ! grep -q "Access-Reject" "$OUT"; then
  fail "User-Name malicioso não foi rejeitado"
fi
echo "PASS  User-Name malicioso rejeitado" >>"$OUT"

if docker compose logs freeradius --since 2m 2>&1 | grep -qiE 'syntax error|STRING DATA RIGHT TRUNCATION|SQL.*(error|failed)'; then
  docker compose logs freeradius --since 2m >>"$OUT" 2>&1
  fail "erro SQL detectado no FreeRADIUS"
fi
echo "PASS  nenhum erro SQL no log do FreeRADIUS" >>"$OUT"

docker compose exec -T freeradius \
  grep -q '^auto_escape = yes$' /etc/freeradius/mods-config/sql/main/postgresql/queries.conf \
  || fail "auto_escape não está habilitado"
docker compose exec -T freeradius \
  grep -q '%{SQL-User-Name}' /etc/freeradius/mods-config/sql/main/postgresql/queries.conf \
  || fail "SQL-User-Name não está em uso"
if docker compose exec -T freeradius \
  grep -q "VALUES ('%{User-Name}'" /etc/freeradius/mods-config/sql/main/postgresql/queries.conf; then
  fail "consulta post-auth ainda interpola User-Name cru"
fi
echo "PASS  configuração SQL usa auto_escape e SQL-User-Name" >>"$OUT"

echo "RESULT  P0 AX-002 aprovado" >>"$OUT"
cat "$OUT"
