#!/usr/bin/env bash
set -euo pipefail
umask 077

cd "$(dirname "$0")/../.."

OUT="/tmp/opencode/p0-artifacts.log"
TMP_BACKUP="/tmp/opencode/p0-backup-test"
mkdir -p /tmp/opencode
rm -rf "$TMP_BACKUP"
mkdir -p "$TMP_BACKUP"

fail() {
  echo "FAIL  $1" >>"$OUT"
  exit 1
}

mode() {
  stat -c '%a' "$1"
}

{
  [[ "$(mode .env)" == "600" ]] || fail ".env não está com modo 600"
  echo "PASS  .env com modo 600"

  [[ "$(mode backups)" == "700" ]] || fail "diretório backups não está com modo 700"
  for file in backups/*.sql backups/*.sql.enc; do
    [[ -e "$file" ]] || continue
    [[ "$(mode "$file")" == "600" ]] || fail "$file não está com modo 600"
  done
  echo "PASS  backups SQL/cifrados com modo 600"

  grep -q '^backups$' .dockerignore || fail ".dockerignore não exclui backups"
  grep -q '^backups/\*\*$' .dockerignore || fail ".dockerignore não exclui backups/**"
  echo "PASS  .dockerignore exclui backups"

  if docker run --rm --entrypoint ls aaa-manager-api /app/backups >/dev/null 2>&1; then
    fail "imagem da API contém /app/backups"
  fi
  echo "PASS  imagem da API não contém backups"

  if docker run --rm --entrypoint ls aaa-manager-worker /app/backups >/dev/null 2>&1; then
    fail "imagem do worker contém /app/backups"
  fi
  echo "PASS  imagem do worker não contém backups"

  if docker run --rm --entrypoint ls aaa-manager-api /app/.env >/dev/null 2>&1; then
    fail "imagem da API contém /app/.env"
  fi
  echo "PASS  imagem da API não contém .env"

  BACKUP_DIR="$TMP_BACKUP" ./scripts/backup.sh >>"$OUT" 2>&1
  generated="$(find "$TMP_BACKUP" -name '*.sql.enc' -print -quit)"
  [[ -n "$generated" ]] || fail "backup de teste não foi criado"
  [[ "$(mode "$generated")" == "600" ]] || fail "backup criado sem modo 600"
  echo "PASS  backup novo é criado cifrado e com modo 600"

  echo "RESULT  P0 AX-003/AX-004 aprovado"
} | tee -a "$OUT"
