#!/usr/bin/env bash
# Ambiente comum dos testes de segurança.
# A API runtime não recebe mais credencial de superusuário nem segredos de
# bootstrap; os runners passam esses valores apenas para o container de teste.

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

# Credenciais de teste/bootstrap não ficam no .env de runtime.
if [[ -f "$(dirname "$0")/test-secrets.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$(dirname "$0")/test-secrets.env"
  set +a
fi

: "${POSTGRES_PASSWORD:?defina POSTGRES_PASSWORD no .env}"

TEST_DATABASE_URL="postgresql://${POSTGRES_USER:-aaa}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-aaa_manager}?schema=public"
export DATABASE_URL="$TEST_DATABASE_URL"
# `-e VAR` sem valor evita colocar segredos nos argumentos do processo.
TEST_ENV=(-e DATABASE_URL -e BOOTSTRAP_ADMIN_EMAIL -e BOOTSTRAP_ADMIN_PASSWORD -e BOOTSTRAP_ADMIN_TOTP_SECRET)
