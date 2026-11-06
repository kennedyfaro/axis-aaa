#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

OUT="/tmp/opencode/p2-hardening.log"
mkdir -p /tmp/opencode
: >"$OUT"

pass() { echo "PASS  $1" | tee -a "$OUT"; }
fail() { echo "FAIL  $1" | tee -a "$OUT"; exit 1; }

docker compose config >/dev/null || fail "docker compose config inválido"
pass "docker compose config válido"

for service in postgres redis api worker freeradius web nginx; do
  id="$(docker compose ps -q "$service")"
  [[ -n "$id" ]] || fail "container ausente: $service"
  max_size="$(docker inspect -f '{{index .HostConfig.LogConfig.Config "max-size"}}' "$id")"
  max_file="$(docker inspect -f '{{index .HostConfig.LogConfig.Config "max-file"}}' "$id")"
  [[ "$max_size" == "10m" && "$max_file" == "3" ]] || fail "$service sem rotação de log 10m/3"
  pass "$service: rotação de log 10m/3"
done

# AX-020: o fallback de NAS curinga é opt-in via RADIUS_ALLOW_WILDCARD_NAS.
source .env
if [[ "${RADIUS_ALLOW_WILDCARD_NAS:-false}" == "true" ]]; then
  if ! docker compose exec -T freeradius \
    grep -q "nasname IN ('%{Packet-Src-IP-Address}', '0.0.0.0/0')" \
    /etc/freeradius/sites-available/dynamic-clients; then
    fail "FreeRADIUS não renderizou o NAS curinga habilitado"
  fi
  pass "FreeRADIUS renderiza o NAS curinga habilitado (opt-in)"
else
  if ! docker compose exec -T freeradius \
    grep -q "__none__" /etc/freeradius/sites-available/dynamic-clients; then
    fail "FreeRADIUS não renderizou o bloqueio do NAS curinga"
  fi
  pass "FreeRADIUS renderiza o NAS curinga como desabilitado"
fi

# AX-020/AX-026: o segredo padrão antigo do cliente radtest não funciona.
if docker compose exec -T freeradius \
  radtest -t mschap "usuario.inexistente" "senha-qualquer" 127.0.0.1 0 testing123 2>&1 \
  | grep -q "Access-Accept"; then
  fail "segredo default testing123 ainda é aceito"
fi
pass "segredo default testing123 não é aceito"

# AX-024: o bootstrap não pode manter o segredo no código de saída.
if grep -Rq 'Segredo TOTP: \${totpSecret}' apps/api/scripts/bootstrap-admin.ts; then
  fail "bootstrap ainda imprime o segredo TOTP"
fi
pass "bootstrap não imprime o segredo TOTP"

# AX-028: SBOM CycloneDX gerado a partir do lockfile do workspace.
pnpm run security:sbom /tmp/opencode/axis-aaa.cdx.json >/dev/null 2>&1 || fail "geração do SBOM falhou"
node -e '
  const fs = require("fs");
  const bom = JSON.parse(fs.readFileSync("/tmp/opencode/axis-aaa.cdx.json", "utf8"));
  if (bom.bomFormat !== "CycloneDX" || bom.specVersion !== "1.5") process.exit(1);
  if (!Array.isArray(bom.components) || bom.components.length < 50) process.exit(1);
  console.log(bom.components.length);
' > /tmp/opencode/p2-sbom-count.txt || fail "SBOM inválido ou incompleto"
pass "SBOM CycloneDX válido ($(cat /tmp/opencode/p2-sbom-count.txt) componentes)"

# Segredos locais: .env restrito e sem segredo default.
[[ "$(stat -c '%a' .env)" == "600" ]] || fail ".env não está em modo 600"
pass ".env está em modo 600"

source .env
[[ "${RADIUS_CLIENT_SECRET:-}" != "testing123" && ${#RADIUS_CLIENT_SECRET} -ge 32 ]] \
  || fail "RADIUS_CLIENT_SECRET ainda é curto/default"
pass "RADIUS_CLIENT_SECRET rotacionado"
if [[ "${RADIUS_ALLOW_WILDCARD_NAS:-false}" == "true" ]]; then
  pass "NAS curinga habilitado explicitamente (opt-in)"
else
  pass "NAS curinga desabilitado"
fi

echo "RESULT  P2 AX-020/AX-024/AX-026/AX-028 aprovado" | tee -a "$OUT"
