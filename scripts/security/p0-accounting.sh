#!/usr/bin/env bash
set -euo pipefail
umask 077

cd "$(dirname "$0")/../.."

source "$(dirname "$0")/test-env.sh"
: "${RADIUS_CLIENT_SECRET:?defina RADIUS_CLIENT_SECRET no .env}"

LOGIN="sec.radius.$(date +%s)"
PASSWORD="SecurityAcct!2026#P0"
SESSION="sec-acct-${LOGIN}"
OUT="/tmp/opencode/p0-accounting-${LOGIN}.log"
mkdir -p /tmp/opencode

fail() {
  echo "FAIL  $1" >>"$OUT"
  exit 1
}

cleanup() {
  docker compose exec -T postgres psql -U aaa -d aaa_manager -q \
    -c "DELETE FROM radacct WHERE acctsessionid = '$SESSION'" >>"$OUT" 2>&1 || true
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

send_acct() {
  local status="$1" time="$2" input="$3" output="$4" cause="${5:-}"
  {
    echo "Acct-Status-Type = $status"
    echo "User-Name = \"$LOGIN\""
    echo "Acct-Session-Id = \"$SESSION\""
    echo "NAS-IP-Address = 127.0.0.1"
    echo "NAS-Port = 0"
    echo "Framed-IP-Address = 192.168.128.250"
    echo "Acct-Session-Time = $time"
    echo "Acct-Input-Octets = $input"
    echo "Acct-Output-Octets = $output"
    [[ -n "$cause" ]] && echo "Acct-Terminate-Cause = $cause"
  } > "/tmp/opencode/p0-acct-${status}.txt"
  docker compose cp "/tmp/opencode/p0-acct-${status}.txt" \
    freeradius:"/tmp/p0-acct-${status}.txt" >>"$OUT" 2>&1
  docker compose exec -T -u 0 freeradius chmod 644 "/tmp/p0-acct-${status}.txt" >>"$OUT" 2>&1
  docker compose exec -T freeradius \
    radclient -f "/tmp/p0-acct-${status}.txt" 127.0.0.1:1813 acct "$RADIUS_CLIENT_SECRET" \
    >>"$OUT" 2>&1
}

send_acct "Start" 0 0 0
start_stop="$(docker compose exec -T postgres psql -U aaa -d aaa_manager -At \
  -c "select coalesce(acctstoptime::text, '<null>') from radacct where acctsessionid='$SESSION'")"
[[ "$start_stop" == "<null>" ]] || fail "Accounting-Start não criou sessão ativa"
echo "PASS  Accounting-Start criou sessão ativa" >>"$OUT"

send_acct "Interim-Update" 10 1024 2048
interim="$(docker compose exec -T postgres psql -U aaa -d aaa_manager -At \
  -c "select acctsessiontime || ':' || acctinputoctets || ':' || acctoutputoctets from radacct where acctsessionid='$SESSION'")"
[[ "$interim" == "10:1024:2048" ]] || fail "Interim-Update não atualizou a sessão (valor=$interim)"
echo "PASS  Interim-Update atualizou tempo e tráfego" >>"$OUT"

send_acct "Stop" 20 4096 8192 "User-Request"
final="$(docker compose exec -T postgres psql -U aaa -d aaa_manager -At \
  -c "select case when acctstoptime is null then 'open' else acctterminatecause end from radacct where acctsessionid='$SESSION'")"
[[ "$final" == "User-Request" ]] || fail "Accounting-Stop não encerrou a sessão (valor=$final)"
echo "PASS  Accounting-Stop encerrou a sessão" >>"$OUT"

echo "RESULT  P0 accounting aprovado" >>"$OUT"
cat "$OUT"
