# Testes de segurança

Pré-requisitos:

- stack em execução (`docker compose up -d`);
- banco com os grupos `Administradores` e `Acesso Full`;
- `.env` com `POSTGRES_PASSWORD`, `RADIUS_CLIENT_SECRET` e
  `BOOTSTRAP_ADMIN_*`;
- permissões esperadas para `.env` e `backups`.

Os runners leem o `.env` do host e passam `DATABASE_URL`/`BOOTSTRAP_ADMIN_*`
apenas para o container de teste. A API em runtime não recebe mais credencial
de superusuário nem segredos de bootstrap.

## Executar

```bash
pnpm test:security:p0
pnpm test:security:p1
pnpm test:security:p2
pnpm test:security:p3
```

Cobertura:

- **P0:** autorização, SQL injection, artefatos, expiração RADIUS, MFA,
  Blast-RADIUS e accounting.
- **P1:** XFF, auditoria/request ID, CSV, lockout, sessões, Swagger/health,
  headers e papéis do PostgreSQL.
- **P2:** notificações, validade, NAS exato, auditoria append-only, alertas,
  segredos de NAS e hardening.
- **P3:** MFA de conta bloqueada, limite por desafio, revogação de JWT,
  revogação de sessões RADIUS, claims JWT, binding de refresh token, allowlist
  de atributos RADIUS, CSP, settings efetivas, rate limit do `/health`,
  `auth_method` real, backups cifrados e grants por coluna.

## TLS

O teste de TLS exige a stack de produção:

```bash
HTTP_PORT=8081 HTTPS_PORT=8443 PUBLIC_ORIGIN=https://nginx PUBLIC_HOST=nginx \
  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
pnpm test:security:tls
```

Os testes criam identidades temporárias com prefixos `sec.`, `p1.`, `p2.` e
`p3.` e removem ao final. Eventos de auditoria são append-only e permanecem
como evidência.
