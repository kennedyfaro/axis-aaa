# Remediação de segurança — P3 Bloco A

Data: 05/11/2026

Escopo executado: AX-029, AX-030, AX-031 e AX-043.
O Bloco B foi executado em `docs/SECURITY-P3-B.md` e os Blocos C/D em
`docs/SECURITY-P3-C-D.md`.

## Resultado

| ID | Status | Correção |
| --- | --- | --- |
| AX-029 | Corrigido | `POST /auth/mfa` valida status do administrador e validade da identidade vinculada antes de emitir sessão. |
| AX-030 | Corrigido | Desafio MFA tem contador por desafio (5 tentativas); ao exceder, é invalidado, auditado e retorna 429. |
| AX-031 | Corrigido | `tokenVersion` no administrador é incluído no JWT e validado em cada requisição; reset/bloqueio/grupos incrementam a versão. |
| AX-043 | Corrigido | PATCH de status, validade ou grupos revoga sessões RADIUS ativas (CoA + accounting) e tokens de painel. |

## Implementação

### AX-029 — MFA de sessão inválida

- `AuthService.mfa()` agora carrega também `user` e exige:
  - `admin.status === "ACTIVE"`;
  - identidade vinculada ativa, não excluída e dentro de `validFrom`/`validUntil`.
- Em caso de falha, o desafio e o contador de tentativas são apagados,
  a tentativa é auditada como `auth.mfa.failed` e a resposta é 401.
- Arquivo: `apps/api/src/auth/auth.service.ts`.

### AX-030 — Limite por desafio MFA

- Novo contador Redis `auth:mfa:attempts:<sha256(challengeId)>`.
- Limite: **5 tentativas** por desafio, TTL de 300 s.
- A sexta tentativa:
  - apaga o desafio;
  - apaga o contador;
  - audita `auth.mfa.locked`;
  - retorna HTTP 429 com mensagem genérica.
- O mesmo limite foi aplicado ao enrollment (`auth.mfa.enrollment.locked`).
- Arquivos: `apps/api/src/auth/auth.service.ts`.

### AX-031 — Revogação de access token JWT

- Nova coluna `admins."tokenVersion"` (`integer not null default 0`).
- O JWT inclui `ver` e o `PermissionsGuard` compara `ver` com
  `admins.tokenVersion` em toda requisição autenticada.
- A versão é incrementada em:
  - reset de senha administrativo;
  - troca da própria senha;
  - bloqueio/exclusão da identidade vinculada (transição para BLOCKED);
  - mudança de grupos ou validade da identidade;
  - reuso de refresh token (toda a família é revogada).
- Refresh tokens continuam revogados nos mesmos eventos.
- Arquivos: `apps/api/prisma/schema.prisma`,
  `apps/api/prisma/migrations/20261105150000_p3_token_version/migration.sql`,
  `apps/api/src/auth/auth.service.ts`,
  `apps/api/src/common/auth.guard.ts`,
  `apps/api/src/common/permissions.guard.ts`,
  `apps/api/src/users/users.service.ts`.

### AX-043 — Revogação de sessões RADIUS em PATCH

- `UsersService.update()` detecta mudanças em `status`, `validUntil` ou
  `groupIds`.
- Quando detectadas:
  - envia CoA/Disconnect via `SessionsService.revokeAllForUser`;
  - encerra o accounting (`radacct.acctstoptime`);
  - invalida tokens de painel para mudanças de grupo/validade.
- O resultado também é registrado em `user.updated` com
  `revokedSessions`, `coaDisconnected` e `panelSessionsRevoked`.
- Arquivo: `apps/api/src/users/users.service.ts`.

## Testes reais

Comando:

```bash
pnpm test:security:p3
```

Resultado final:

```text
PASS  usuário de teste mfablk-... criado
PASS  segredo TOTP do usuário de teste disponível
PASS  primeiro fator emitido para identidade administrativa
PASS  MFA de administrador bloqueado é rejeitado
PASS  falha de MFA de sessão inválida é auditada
PASS  usuário de teste mfaatt-... criado
PASS  desafio MFA emitido
PASS  cinco códigos errados retornam 401
PASS  sexta tentativa invalida o desafio e retorna 429
PASS  bloqueio do desafio MFA é auditado
PASS  usuário de teste jwt-... criado
PASS  access token válido antes do reset
PASS  reset de senha responde
PASS  access token antigo é rejeitado após reset de senha
PASS  refresh token antigo é rejeitado após reset de senha
PASS  usuário de teste sessst-... criado
PASS  PATCH de status bloqueado responde
PASS  sessão RADIUS é encerrada ao bloquear via PATCH
PASS  usuário de teste sessgr-... criado
PASS  PATCH de grupos responde
PASS  sessão RADIUS é encerrada ao mudar grupos
PASS  access token antigo é rejeitado após mudança de grupos
PASS  usuário de teste sessvl-... criado
PASS  PATCH de validade responde
PASS  sessão RADIUS é encerrada ao mudar validade
RESULT  P3 Bloco A aprovado
```

## Regressões

```text
P0: AX-001, AX-007, AX-006, AX-002, accounting, AX-008, AX-003/AX-004 — aprovado
P1 web: AX-009/011/012/013/014/015/016 — aprovado
P1 DB: AX-010 — aprovado
P2: AX-018/AX-020/AX-021/AX-023/AX-025/AX-026/AX-027/AX-028/AX-019 — aprovado
```

Qualidade:

```text
pnpm typecheck ....... ok
pnpm test ............ 37 API + 12 web
pnpm audit ........... 0 vulnerabilidades
git diff --check ..... ok
```

Observação: o teste P2 de RADIUS foi ajustado para separar o probe de IP
desconhecido do probe de IP exato e reiniciar o FreeRADIUS entre as fases,
evitando o cache de 60 s de clientes dinâmicos.

## Riscos de regressão e impacto operacional

- **Sessões existentes:** JWTs emitidos antes da migration não têm `ver`; são
  tratados como `0` e continuam válidos até expirar. A partir do primeiro
  reset/bloqueio/grupo, a versão sobe e tokens antigos são rejeitados.
- **PATCH de usuário:** mudanças de status, validade ou grupos agora podem
  aguardar CoA/Disconnect e encerrar sessões VPN/PPPoE. Isso é intencional.
- **MFA:** após 5 códigos errados, o desafio é descartado; o usuário precisa
  refazer login/senha. O limite por IP continua ativo.
- **Administradores:** reset de senha e mudança de grupos exigem novo login.
- **Testes P2:** o runner agora reinicia o FreeRADIUS entre os dois probes de
  RADIUS; isso adiciona alguns segundos à suíte.

## Rollback

- **Banco pré-P3:** `backups/aaa_manager-20261105T141822Z.sql`
- **Código pré-P3:** `/tmp/opencode/aaa-manager-pos-p2.tar.gz` (modo `600`)
- **Migration:** após reverter o código, remover a coluna:
  ```sql
  ALTER TABLE "admins" DROP COLUMN IF EXISTS "tokenVersion";
  ```
- **Testes:** remover `scripts/security/p3-web.sh` e
  `apps/api/scripts/security-p3-web.mjs` se necessário.

## Pendente

Os Blocos B, C e D foram concluídos; restam itens operacionais:

- AX-034: bind/firewall de UDP 1812/1813 (requer IP/CIDR de gerência);
- AX-056: rotação dos shared secrets legados de 10 NAS;
- rotação histórica de `JWT_ACCESS_SECRET`, `ENCRYPTION_KEY` e senha do
  PostgreSQL na janela de manutenção.
