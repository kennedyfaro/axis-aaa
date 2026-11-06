#!/usr/bin/env bash
set -euo pipefail
umask 077

cd "$(dirname "$0")/../.."

source "$(dirname "$0")/test-env.sh"
: "${RADIUS_CLIENT_SECRET:?defina RADIUS_CLIENT_SECRET no .env}"

LOGIN="sec.radius.$(date +%s)"
PASSWORD="SecurityRadius!2026#P0"
OUT="/tmp/opencode/p0-radius-${LOGIN}.log"
mkdir -p /tmp/opencode

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

radtest_assert() {
  local expected="$1"
  local output
  output="$(docker compose exec -T freeradius radtest -t mschap "$LOGIN" "$PASSWORD" 127.0.0.1 0 "$RADIUS_CLIENT_SECRET" 2>&1 || true)"
  printf '%s\n' "$output" >>"$OUT"
  if ! grep -q "Access-${expected}" <<<"$output"; then
    echo "FAIL  esperado Access-${expected}" >>"$OUT"
    return 1
  fi
  echo "PASS  Access-${expected}" >>"$OUT"
}

psql_exec() {
  docker compose exec -T postgres psql -U aaa -d aaa_manager -v ON_ERROR_STOP=1 -c "$1" >>"$OUT" 2>&1
}

radtest_assert "Accept"

psql_exec "UPDATE users SET \"validUntil\" = NOW() - INTERVAL '1 day' WHERE login = '$LOGIN'"
radtest_assert "Reject"

psql_exec "UPDATE users SET \"validFrom\" = NOW() + INTERVAL '1 day', \"validUntil\" = NOW() + INTERVAL '2 days' WHERE login = '$LOGIN'"
radtest_assert "Reject"

psql_exec "UPDATE users SET \"validFrom\" = NOW() - INTERVAL '1 day', \"validUntil\" = NOW() + INTERVAL '1 day' WHERE login = '$LOGIN'"
radtest_assert "Accept"

AUTH_METHOD="$(docker compose exec -T postgres psql -U aaa -d aaa_manager -At \
  -c "SELECT auth_method FROM radpostauth WHERE username = '$LOGIN' ORDER BY authdate DESC LIMIT 1" | tr -d '\r')"
if [[ -z "$AUTH_METHOD" || "$AUTH_METHOD" == "mschapv2" ]]; then
  echo "FAIL  auth_method RADIUS não reflete o método real ($AUTH_METHOD)" >>"$OUT"
  exit 1
fi
echo "PASS  auth_method RADIUS real ($AUTH_METHOD)" >>"$OUT"

echo "RESULT  P0 AX-006 aprovado" >>"$OUT"
cat "$OUT"
