#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

OUT="/tmp/opencode/p1-deps.log"
mkdir -p /tmp/opencode
: >"$OUT"

pass() { echo "PASS  $1" | tee -a "$OUT"; }
fail() { echo "FAIL  $1" | tee -a "$OUT"; exit 1; }

if pnpm audit --prod --json > /tmp/opencode/p1-audit-prod-final.json 2>/dev/null; then
  pass "pnpm audit --prod sem vulnerabilidades"
else
  fail "pnpm audit --prod encontrou vulnerabilidades"
fi

if pnpm audit --json > /tmp/opencode/p1-audit-all-final.json 2>/dev/null; then
  pass "pnpm audit completo sem vulnerabilidades"
else
  fail "pnpm audit completo encontrou vulnerabilidades"
fi

pnpm install --frozen-lockfile >/dev/null 2>&1 || fail "lockfile não está sincronizado"
pass "lockfile sincronizado"

pnpm typecheck >/dev/null 2>&1 || fail "typecheck falhou"
pass "typecheck"

pnpm test >/dev/null 2>&1 || fail "testes unitários falharam"
pass "testes unitários"

pnpm --filter @aaa/web lint >/dev/null 2>&1 || fail "lint falhou"
pass "lint"

echo "RESULT  P1 AX-019 aprovado" | tee -a "$OUT"
