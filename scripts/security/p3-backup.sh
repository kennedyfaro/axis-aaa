#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
source "$(dirname "$0")/test-env.sh"

OUT="/tmp/opencode/p3-backup.log"
mkdir -p /tmp/opencode
: >"$OUT"

pass() { echo "PASS  $1" | tee -a "$OUT"; }
fail() { echo "FAIL  $1" | tee -a "$OUT"; exit 1; }

: "${BACKUP_ENCRYPTION_KEY:?defina BACKUP_ENCRYPTION_KEY no .env}"

TEMP_SQL="$(mktemp /tmp/opencode/p3-restore-XXXXXX.sql)"
TEMP_DB="aaa_restore_p3_$(date +%s)"
cleanup() {
  rm -f "$TEMP_SQL"
  docker compose exec -T postgres psql -U aaa -d postgres -q \
    -c "DROP DATABASE IF EXISTS \"$TEMP_DB\" WITH (FORCE)" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if ! ./scripts/backup.sh >>"$OUT" 2>&1; then
  fail "geração de backup cifrado"
fi

BACKUP_FILE="$(ls -1t backups/*.sql.enc 2>/dev/null | head -1)"
[[ -n "$BACKUP_FILE" && -f "$BACKUP_FILE" ]] || fail "backup .enc não encontrado"
[[ "$(stat -c '%a' "$BACKUP_FILE")" == "600" ]] || fail "backup não está em modo 600"
if grep -q "PostgreSQL database dump" "$BACKUP_FILE" 2>/dev/null; then
  fail "backup não está cifrado"
fi
pass "backup gerado em texto cifrado e modo 600"

openssl enc -d -aes-256-cbc -pbkdf2 -salt \
  -pass env:BACKUP_ENCRYPTION_KEY < "$BACKUP_FILE" > "$TEMP_SQL"
chmod 600 "$TEMP_SQL"
grep -q "PostgreSQL database dump" "$TEMP_SQL" || fail "decifração do backup falhou"
pass "backup decifra com BACKUP_ENCRYPTION_KEY"

docker compose exec -T postgres psql -U aaa -d postgres -q \
  -c "CREATE DATABASE \"$TEMP_DB\"" >>"$OUT" 2>&1 || fail "criação do banco temporário"
docker compose exec -T postgres psql -U aaa -d "$TEMP_DB" -q < "$TEMP_SQL" >>"$OUT" 2>&1 \
  || fail "restauração do backup no banco temporário"
USERS="$(docker compose exec -T postgres psql -U aaa -d "$TEMP_DB" -At \
  -c "select count(*) from users")"
[[ "$USERS" -gt 0 ]] || fail "restauração não encontrou usuários"
pass "restauração real do backup em banco temporário ($USERS usuários)"

echo "RESULT  P3 AX-045 aprovado" | tee -a "$OUT"
