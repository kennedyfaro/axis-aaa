#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

FILE="${1:-}"
if [[ -z "$FILE" || ! -f "$FILE" ]]; then
  echo "Uso: ./scripts/restore.sh backups/arquivo.sql[.enc]"
  exit 1
fi

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

USER_NAME="${POSTGRES_USER:-aaa}"
DB_NAME="${POSTGRES_DB:-aaa_manager}"

echo "A restauração substitui os dados de $DB_NAME."
read -r -p "Digite RESTAURAR para continuar: " CONFIRM
if [[ "$CONFIRM" != "RESTAURAR" ]]; then
  echo "Cancelado."
  exit 1
fi

TEMP=""
cleanup() {
  if [[ -n "$TEMP" ]]; then
    rm -f "$TEMP"
  fi
}
trap cleanup EXIT

if [[ "$FILE" == *.enc ]]; then
  : "${BACKUP_ENCRYPTION_KEY:?defina BACKUP_ENCRYPTION_KEY no .env}"
  mkdir -p /tmp/opencode
  TEMP="$(mktemp /tmp/opencode/restore-XXXXXX.sql)"
  chmod 600 "$TEMP"
  openssl enc -d -aes-256-cbc -pbkdf2 -salt \
    -pass env:BACKUP_ENCRYPTION_KEY < "$FILE" > "$TEMP"
  docker compose exec -T postgres psql -U "$USER_NAME" -d "$DB_NAME" < "$TEMP"
else
  docker compose exec -T postgres psql -U "$USER_NAME" -d "$DB_NAME" < "$FILE"
fi

echo "Restauração concluída a partir de $FILE."
