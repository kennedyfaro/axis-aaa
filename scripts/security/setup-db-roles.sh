#!/usr/bin/env bash
set -euo pipefail
umask 077

cd "$(dirname "$0")/../.."

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

: "${POSTGRES_USER:?}"
: "${POSTGRES_DB:?}"
: "${POSTGRES_APP_PASSWORD:?}"
: "${POSTGRES_WORKER_PASSWORD:?}"
: "${POSTGRES_RADIUS_PASSWORD:?}"

docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -v ON_ERROR_STOP=1 <<EOSQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aaa_app') THEN
    CREATE ROLE aaa_app LOGIN PASSWORD '${POSTGRES_APP_PASSWORD}';
  ELSE
    ALTER ROLE aaa_app PASSWORD '${POSTGRES_APP_PASSWORD}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aaa_worker') THEN
    CREATE ROLE aaa_worker LOGIN PASSWORD '${POSTGRES_WORKER_PASSWORD}';
  ELSE
    ALTER ROLE aaa_worker PASSWORD '${POSTGRES_WORKER_PASSWORD}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aaa_radius') THEN
    CREATE ROLE aaa_radius LOGIN PASSWORD '${POSTGRES_RADIUS_PASSWORD}';
  ELSE
    ALTER ROLE aaa_radius PASSWORD '${POSTGRES_RADIUS_PASSWORD}';
  END IF;
END
\$\$;

ALTER ROLE aaa_app NOSUPERUSER NOCREATEDB NOCREATEROLE;
ALTER ROLE aaa_worker NOSUPERUSER NOCREATEDB NOCREATEROLE;
ALTER ROLE aaa_radius NOSUPERUSER NOCREATEDB NOCREATEROLE;
EOSQL

docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -v ON_ERROR_STOP=1 -f - < infra/postgres/runtime-grants.sql

echo "Papéis e grants aplicados."
