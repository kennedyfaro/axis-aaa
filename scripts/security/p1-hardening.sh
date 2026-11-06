#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

OUT="/tmp/opencode/p1-hardening.log"
mkdir -p /tmp/opencode
: >"$OUT"

pass() { echo "PASS  $1" | tee -a "$OUT"; }
fail() { echo "FAIL  $1" | tee -a "$OUT"; exit 1; }

docker compose config >/dev/null || fail "docker compose config inválido"
pass "docker compose config válido"

for service in postgres redis api worker freeradius web nginx; do
  id="$(docker compose ps -q "$service")"
  [[ -n "$id" ]] || fail "container ausente: $service"
  caps="$(docker inspect -f '{{json .HostConfig.CapDrop}}' "$id")"
  [[ "$caps" == *'"ALL"'* || "$caps" == *'ALL'* ]] || fail "$service sem cap_drop ALL"
  security="$(docker inspect -f '{{json .HostConfig.SecurityOpt}}' "$id")"
  [[ "$security" == *'no-new-privileges:true'* ]] || fail "$service sem no-new-privileges"
  memory="$(docker inspect -f '{{.HostConfig.Memory}}' "$id")"
  [[ "$memory" -gt 0 ]] || fail "$service sem limite de memória"
  pass "$service: cap_drop ALL, no-new-privileges e limite de memória"
done

[[ "$(docker inspect -f '{{.HostConfig.ReadonlyRootfs}}' "$(docker compose ps -q api)")" == "true" ]] || fail "api sem rootfs read-only"
[[ "$(docker inspect -f '{{.HostConfig.ReadonlyRootfs}}' "$(docker compose ps -q worker)")" == "true" ]] || fail "worker sem rootfs read-only"
pass "api e worker com rootfs read-only"

ports="$(docker compose ps --format '{{.Service}} {{.Ports}}')"
grep -q '1812-1813->1812-1813/udp' <<<"$ports" || fail "porta RADIUS 1812/1813 não publicada"
grep -q '8081->80/tcp' <<<"$ports" || fail "porta HTTP local não publicada"
if grep -qE '5432->|6379->' <<<"$ports"; then
  fail "PostgreSQL ou Redis expostos no host"
fi
pass "RADIUS publicado; PostgreSQL e Redis não expostos"

echo "RESULT  P1 AX-017 aprovado" | tee -a "$OUT"
