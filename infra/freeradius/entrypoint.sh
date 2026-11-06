#!/bin/sh
set -eu

DB_HOST="${RADIUS_DB_HOST:-postgres}"
DB_USER="${RADIUS_DB_USER:-aaa}"
DB_PASSWORD="${RADIUS_DB_PASSWORD:?RADIUS_DB_PASSWORD is required}"
DB_NAME="${RADIUS_DB_NAME:-aaa_manager}"
CLIENT_SECRET="${RADIUS_CLIENT_SECRET:?RADIUS_CLIENT_SECRET is required}"
REQUIRE_MA="${RADIUS_REQUIRE_MA:-true}"
ALLOW_WILDCARD="${RADIUS_ALLOW_WILDCARD_NAS:-false}"

case "$ALLOW_WILDCARD" in
  true|yes|1) WILDCARD_NAS="0.0.0.0/0" ;;
  false|no|0) WILDCARD_NAS="__none__" ;;
  *)
    echo "RADIUS_ALLOW_WILDCARD_NAS invalido: $ALLOW_WILDCARD (use true ou false)" >&2
    exit 1
    ;;
esac

case "$REQUIRE_MA" in
  true|yes|1) REQUIRE_MA="yes" ;;
  false|no|0) REQUIRE_MA="no" ;;
  *)
    echo "RADIUS_REQUIRE_MA invalido: $REQUIRE_MA (use true ou false)" >&2
    exit 1
    ;;
esac

escape() {
  printf '%s' "$1" | sed 's/[&|]/\\&/g'
}

sed \
  -e "s|__DB_HOST__|$(escape "$DB_HOST")|g" \
  -e "s|__DB_USER__|$(escape "$DB_USER")|g" \
  -e "s|__DB_PASSWORD__|$(escape "$DB_PASSWORD")|g" \
  -e "s|__DB_NAME__|$(escape "$DB_NAME")|g" \
  /templates/sql.template > /etc/freeradius/mods-available/sql

sed \
  -e "s|__CLIENT_SECRET__|$(escape "$CLIENT_SECRET")|g" \
  -e "s|__REQUIRE_MA__|$REQUIRE_MA|g" \
  /templates/clients.template > /etc/freeradius/clients.conf

# Os arquivos gerados contêm senha do banco e shared secret do cliente local.
# Mantê-los 600 evita leitura por outros processos dentro do container.
chmod 600 /etc/freeradius/clients.conf /etc/freeradius/mods-available/sql

# O site dynamic-clients é copiado na imagem; resolve os placeholders em runtime.
sed -i \
  -e "s|__REQUIRE_MA__|$REQUIRE_MA|g" \
  -e "s|__WILDCARD_NAS__|$(escape "$WILDCARD_NAS")|g" \
  /etc/freeradius/sites-available/dynamic-clients

# O site padrao traz o modulo SQL desabilitado com "-sql".
# Habilita o SQL em authorize, accounting e post-auth sem manter uma copia
# integral do arquivo de configuracao (que muda entre versoes do FreeRADIUS).
sed 's/^\([[:space:]]*\)-sql/\1sql/' \
  /etc/freeradius/sites-available/default > /tmp/default.site
cp /tmp/default.site /etc/freeradius/sites-available/default

/patch-queries.pl /etc/freeradius/mods-config/sql/main/postgresql/queries.conf

if ! grep -q device_access /etc/freeradius/sites-available/default; then
  perl -0pi -e 's/\n(\s*)sql\n/\n$1sql\n$1device_access\n/' /etc/freeradius/sites-available/default
fi

ln -sf ../mods-available/sql /etc/freeradius/mods-enabled/sql

exec "$@"
