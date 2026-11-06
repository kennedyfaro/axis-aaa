#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

: "${BACKUP_ENCRYPTION_KEY:?defina BACKUP_ENCRYPTION_KEY no .env (openssl rand -hex 32)}"

USER_NAME="${POSTGRES_USER:-aaa}"
DB_NAME="${POSTGRES_DB:-aaa_manager}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DIR="${BACKUP_DIR:-backups}"
mkdir -p "$DIR"

FILE="$DIR/$DB_NAME-$STAMP.sql.enc"
docker compose exec -T postgres pg_dump -U "$USER_NAME" -d "$DB_NAME" --clean --if-exists \
  | openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_ENCRYPTION_KEY > "$FILE"
chmod 600 "$FILE"

if [[ ! -s "$FILE" ]]; then
  rm -f "$FILE"
  echo "Falha: backup vazio." >&2
  exit 1
fi

echo "Backup cifrado criado: $FILE"
echo "Restaure com: ./scripts/restore.sh $FILE"
