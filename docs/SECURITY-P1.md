# Remediação de segurança — fase P1

Data: 05/11/2026

Escopo: AX-009, AX-010, AX-011, AX-012, AX-013, AX-014, AX-015, AX-016, AX-017 e AX-019.
Nenhuma migration Prisma foi adicionada ou alterada.

## Correções

| ID | Correção |
| --- | --- |
| AX-009 | `clientIp` usa `req.ip` com um único proxy confiável; nginx sobrescreve `X-Forwarded-For`; rate limit por IP e por conta. |
| AX-010 | Papéis `aaa_app`, `aaa_worker` e `aaa_radius` sem superusuário, com grants mínimos; `nas.secret` não é legível pela API; triggers de auditoria em `SECURITY DEFINER` com `search_path` fixo. |
| AX-011 | `requestId` sempre gerado no servidor; auditoria com retry e falha não destrutiva; header do cliente não controla a chave única. |
| AX-012 | Células CSV com `= + - @` e control chars são prefixadas com `'`; aspas escapadas. |
| AX-013 | `maxLoginAttempts` aplicado por conta com bloqueio de 15 min; limitador adicional por IP; bloqueio auditado. |
| AX-014 | Reset/troca de senha revoga sessões RADIUS (com CoA) e refresh tokens do painel. |
| AX-015 | Swagger desabilitado em produção por padrão (`ENABLE_API_DOCS=false`); `/health` público mínimo; `/health/details` exige `settings.read`. |
| AX-016 | CSP, COOP, CORP, XFO, nosniff, Referrer-Policy, Permissions-Policy e HSTS na stack TLS. |
| AX-017 | `cap_drop: ALL`, `no-new-privileges`, limites de CPU/memória, rootfs read-only em API/worker; PostgreSQL/Redis não publicados. |
| AX-019 | Overrides para `multer 2.5.0`, `deepmerge-ts 8.0.2`, `js-yaml 5.5.0` e `minimatch 11.0.4`; `pnpm audit` sem vulnerabilidades. |

## Papéis do PostgreSQL

Criados por `infra/postgres/init/00-roles.sh` em volumes novos ou por
`scripts/security/setup-db-roles.sh` em banco existente.

- `aaa` — owner/migrador. Permanece superusuário para migrations/backup; não é usado pela API, worker nem FreeRADIUS em runtime.
- `aaa_app` — API. DML nas tabelas da aplicação, RADIUS sync, `radacct` SELECT/UPDATE e `audit_events` SELECT/INSERT. Não lê `nas.secret` e não altera/apaga auditoria.
- `aaa_worker` — manutenção. Lê usuários/devices/radacct/radpostauth/settings, atualiza presença e apaga registros antigos de accounting/auth; não acessa `nas`.
- `aaa_radius` — FreeRADIUS. SELECT em `radcheck`, `radreply`, grupos, views, `nas.secret` e colunas de validade de `users`; INSERT/UPDATE em `radacct`; INSERT em `radpostauth`. Não lê `users."radiusNtHash"` e não apaga accounting.

Os triggers `audit_radius_postauth()` e `audit_radius_acct()` são
`SECURITY DEFINER` com `search_path = public, pg_temp`, para gravar auditoria
sem conceder leitura/escrita de `audit_events` ao FreeRADIUS.

## Variáveis novas

```text
POSTGRES_APP_PASSWORD
POSTGRES_WORKER_PASSWORD
POSTGRES_RADIUS_PASSWORD
ENABLE_API_DOCS=false
```

Migrations/grants são executados pelo serviço one-shot `migrate`, que usa a
credencial do migrador. A API em runtime usa apenas o papel `aaa_app`.

## Evidências

- `pnpm test:security:p0`: regressão P0 aprovada com os novos papéis.
- `pnpm test:security:p1` (script `scripts/security/p1-web.sh`): XFF, request ID, CSV, lockout, revogação de sessão, Swagger/health e headers.
- `scripts/security/p1-db.sh`: privilégios dos papéis e triggers.
- `scripts/security/p1-hardening.sh`: cap_drop, no-new-privileges, read-only, limites e portas.
- `scripts/security/p1-deps.sh`: audit, lockfile, typecheck, testes e lint.
- TLS: `scripts/security/p0-tls.sh` e headers HSTS/CSP na stack de produção.

## Pendências

- Rotacionar segredos históricos (JWT, encryption key, senha do banco, Debug, NAS, RADIUS).
- Avaliar `aaa` migrador sem superusuário com papel de break-glass.
- CSP ainda usa `'unsafe-inline'`/`'unsafe-eval'` por compatibilidade com Next.js; migrar para nonce.
- `Message-Authenticator` está desativado por decisão operacional (`RADIUS_REQUIRE_MA=false`).
- Itens P2 do relatório não foram iniciados.
