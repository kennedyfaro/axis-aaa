#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

SID="smoke-$(date +%s)"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

: "${RADIUS_TEST_USER:?defina RADIUS_TEST_USER (crie a identidade no painel)}"
: "${RADIUS_TEST_PASSWORD:?defina RADIUS_TEST_PASSWORD}"
: "${RADIUS_CLIENT_SECRET:?defina RADIUS_CLIENT_SECRET no .env}"
USER_NAME="$RADIUS_TEST_USER"
PASSWORD="$RADIUS_TEST_PASSWORD"
SECRET="$RADIUS_CLIENT_SECRET"

auth() {
  docker compose exec -T freeradius \
    radtest -t mschap "$1" "$2" 127.0.0.1 0 "$SECRET" 2>&1 || true
}

echo "1) autenticação válida"
if auth "$USER_NAME" "$PASSWORD" | grep -q "Access-Accept"; then
  echo "   OK: Access-Accept"
else
  echo "   FALHA: esperava Access-Accept"
  exit 1
fi

echo "2) senha inválida"
if auth "$USER_NAME" "senha-incorreta-$(date +%s)" | grep -q "Access-Reject"; then
  echo "   OK: Access-Reject"
else
  echo "   FALHA: esperava Access-Reject"
  exit 1
fi

echo "3) accounting Start, Interim e Stop"
docker compose exec -T freeradius sh -c "printf '%s\n' 'Acct-Status-Type=Start,Acct-Session-Id=$SID,User-Name=$USER_NAME,NAS-IP-Address=10.10.0.1,Framed-IP-Address=10.80.12.99,Acct-Input-Octets=1000,Acct-Output-Octets=500' | radclient 127.0.0.1:1813 acct $SECRET" >/dev/null
docker compose exec -T freeradius sh -c "printf '%s\n' 'Acct-Status-Type=Interim-Update,Acct-Session-Id=$SID,User-Name=$USER_NAME,NAS-IP-Address=10.10.0.1,Framed-IP-Address=10.80.12.99,Acct-Input-Octets=5000,Acct-Output-Octets=900,Acct-Session-Time=120' | radclient 127.0.0.1:1813 acct $SECRET" >/dev/null
docker compose exec -T freeradius sh -c "printf '%s\n' 'Acct-Status-Type=Stop,Acct-Session-Id=$SID,User-Name=$USER_NAME,NAS-IP-Address=10.10.0.1,Framed-IP-Address=10.80.12.99,Acct-Input-Octets=5000,Acct-Output-Octets=900,Acct-Session-Time=180,Acct-Terminate-Cause=User-Request' | radclient 127.0.0.1:1813 acct $SECRET" >/dev/null

RESULT=$(docker compose exec -T postgres psql -U "${POSTGRES_USER:-aaa}" -d "${POSTGRES_DB:-aaa_manager}" -tAc \
  "SELECT count(*) FROM radacct WHERE acctsessionid='$SID' AND acctstoptime IS NOT NULL;")
if [[ "$RESULT" == "1" ]]; then
  echo "   OK: sessão $SID encerrada no accounting"
else
  echo "   FALHA: accounting não encontrado (resultado: $RESULT)"
  exit 1
fi

docker compose exec -T postgres psql -U "${POSTGRES_USER:-aaa}" -d "${POSTGRES_DB:-aaa_manager}" -q \
  -c "DELETE FROM radacct WHERE acctsessionid='$SID';" >/dev/null

echo "RADIUS: todos os testes passaram."
