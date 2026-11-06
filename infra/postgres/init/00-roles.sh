#!/bin/sh
set -eu

: "${POSTGRES_APP_PASSWORD:?POSTGRES_APP_PASSWORD is required}"
: "${POSTGRES_WORKER_PASSWORD:?POSTGRES_WORKER_PASSWORD is required}"
: "${POSTGRES_RADIUS_PASSWORD:?POSTGRES_RADIUS_PASSWORD is required}"

# psql variables + format(%L) evitam interpolar a senha diretamente no SQL
# (aspas, backslash ou `$` no segredo não quebram o script).
psql -v ON_ERROR_STOP=1 \
  -v app_pw="$POSTGRES_APP_PASSWORD" \
  -v worker_pw="$POSTGRES_WORKER_PASSWORD" \
  -v radius_pw="$POSTGRES_RADIUS_PASSWORD" \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'EOSQL'
SELECT format('CREATE ROLE aaa_app LOGIN PASSWORD %L', :'app_pw')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aaa_app')\gexec
SELECT format('ALTER ROLE aaa_app PASSWORD %L', :'app_pw')\gexec

SELECT format('CREATE ROLE aaa_worker LOGIN PASSWORD %L', :'worker_pw')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aaa_worker')\gexec
SELECT format('ALTER ROLE aaa_worker PASSWORD %L', :'worker_pw')\gexec

SELECT format('CREATE ROLE aaa_radius LOGIN PASSWORD %L', :'radius_pw')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aaa_radius')\gexec
SELECT format('ALTER ROLE aaa_radius PASSWORD %L', :'radius_pw')\gexec

ALTER ROLE aaa_app NOSUPERUSER NOCREATEDB NOCREATEROLE;
ALTER ROLE aaa_worker NOSUPERUSER NOCREATEDB NOCREATEROLE;
ALTER ROLE aaa_radius NOSUPERUSER NOCREATEDB NOCREATEROLE;

GRANT USAGE ON SCHEMA public TO aaa_app, aaa_worker, aaa_radius;
EOSQL
