# Auditoria de segurança — fase P3

Data: 05/11/2026

Escopo: nova auditoria completa do Áxis AAA (API, worker, web, PostgreSQL,
FreeRADIUS, nginx, Docker e scripts operacionais). Nenhuma alteração de código
foi feita nesta etapa.

> **Atualização:** os Blocos A, B, C e D foram implementados e testados em
> `docs/SECURITY-P3.md`, `docs/SECURITY-P3-B.md` e `docs/SECURITY-P3-C-D.md`.
> AX-034 depende do IP/CIDR de gerência dos NAS; os resíduos AX-055 a AX-057
> permanecem como itens operacionais documentados.

## Método

- Revisão estática de todos os controllers, services, guards, DTOs, migrations,
  scripts e arquivos de infraestrutura.
- Revisão da configuração em execução: `docker compose config`, `docker inspect`,
  portas publicadas, usuários de container, grants do PostgreSQL e headers HTTP.
- Probes reais contra a stack em `http://localhost:8081` para confirmar os
  achados de autenticação, sessão e NAS.
- `pnpm audit`, `pnpm typecheck`, `pnpm test` e regressões P0/P1/P2 como linha
  de base.

## Resumo executivo

Foram encontrados **20 achados principais** e **9 observações adicionais**.

- **4 achados confirmados dinamicamente:** MFA de conta bloqueada, ausência de
  limite por desafio MFA, access token válido após reset de senha e IP de NAS
  duplicado.
- **6 achados altos:** os quatro acima, seed destrutivo/rotação de segredo de NAS
  e vazamento de segredo em log de erro do Prisma.
- **A exposição de UDP 1812/1813 em todas as interfaces** continua sem firewall
  de host verificado.
- A stack mantém P0/P1/P2 aprovados; os achados P3 são novas lacunas ou
  resíduos que não estavam no escopo anterior.

## Achados principais

| ID | Severidade | Achado | Status |
| --- | --- | --- | --- |
| AX-029 | Alta | Desafio MFA conclui login de administrador bloqueado | Corrigido (Bloco A) |
| AX-030 | Alta | Desafio MFA sem limite de tentativas por desafio | Corrigido (Bloco A) |
| AX-031 | Alta | Access token continua válido após reset de senha/bloqueio | Corrigido (Bloco A) |
| AX-032 | Alta | Seed destrutivo e rotação de segredo de NAS a cada execução | Corrigido (Bloco B) |
| AX-033 | Alta | Erros do Prisma podem gravar segredos de NAS nos logs | Corrigido (Bloco B) |
| AX-034 | Alta | UDP 1812/1813 publicado em todas as interfaces | Pendente (IP/CIDR) |
| AX-035 | Média | Dois NAS com o mesmo IP são aceitos | Corrigido (Bloco B) |
| AX-036 | Média | API runtime recebe URL de superusuário e segredos de bootstrap | Corrigido (Bloco B) |
| AX-037 | Média | Segredos TOTP armazenados em texto puro | Corrigido (Bloco B) |
| AX-038 | Média | CLI `mfa-code` gera código TOTP de administrador | Mitigado (Bloco B) |
| AX-039 | Média | `aaa_worker` lê e altera todas as colunas de `users` | Corrigido (Bloco B) |
| AX-040 | Média | `policies` e parte das settings continuam decorativas | Mitigado (Bloco C) |
| AX-041 | Média | CSP permite `unsafe-inline` e `unsafe-eval` | Corrigido (Bloco C) |
| AX-042 | Média | Refresh token não é vinculado a IP/User-Agent | Corrigido (Bloco C) |
| AX-043 | Média | Alteração de status/validade/grupo não revoga sessões RADIUS | Corrigido (Bloco A) |
| AX-044 | Média | Atributos RADIUS de grupo são arbitrários | Corrigido (Bloco C) |
| AX-045 | Média | Backups SQL são texto puro com segredos | Corrigido (Bloco B) |
| AX-046 | Média | FreeRADIUS/nginx/PostgreSQL/Redis rodam como root | Mitigado (Bloco B) |
| AX-047 | Baixa | `radpostauth.auth_method` é sempre `mschapv2` | Corrigido (Bloco C) |
| AX-048 | Baixa | `/health` público executa consultas e revela mapa de serviços | Corrigido (Bloco C) |

### AX-029 — MFA de administrador bloqueado

- **Causa raiz:** `AuthService.mfa()` valida apenas a existência do administrador
  e do segredo TOTP; não valida `admin.status` nem a identidade vinculada.
- **Evidência real:**
  ```text
  PROBE_MFA_BLOCKED status=200 VULNERAVEL
  ```
- **Impacto:** um administrador bloqueado, com desafio MFA pendente, consegue
  concluir o login e receber cookies de sessão. A sessão é rejeitada nas
  requisições seguintes pelo `PermissionsGuard`, mas o login e a emissão de
  tokens já ocorreram.
- **Arquivos:** `apps/api/src/auth/auth.service.ts` (método `mfa`).
- **Correção proposta:** carregar `user` e validar `admin.status === ACTIVE`,
  `user` ativo, `deletedAt`, `validFrom` e `validUntil` antes de emitir sessão;
  apagar o desafio e auditar a falha quando inválido.

### AX-030 — Sem limite de tentativas por desafio MFA

- **Causa raiz:** `RateLimitService.mfa()` usa apenas o IP de origem. O desafio
  em Redis não tem contador de tentativas e não é invalidado após erros.
- **Evidência real:**
  ```text
  PROBE_MFA_ATTEMPTS wrong=401,401,401,401,401 correct=200 SEM_LIMITE_POR_DESAFIO
  ```
- **Impacto:** um atacante distribuído pode testar códigos TOTP no mesmo desafio
  até acertar, sem bloqueio por conta/desafio. O limite por IP não cobre botnet.
- **Arquivos:** `apps/api/src/auth/auth.service.ts`,
  `apps/api/src/common/rate-limit.service.ts`.
- **Correção proposta:** contador `auth:mfa:attempts:<challengeId>` com limite
  (ex.: 5), invalidação do desafio ao exceder, auditoria `auth.mfa.locked` e
  rate limit por desafio + IP.

### AX-031 — Access token sobrevive ao reset de senha/bloqueio

- **Causa raiz:** o JWT é stateless; reset de senha revoga refresh tokens e
  sessões RADIUS, mas não invalida o access token já emitido.
- **Evidência real:**
  ```text
  PROBE_JWT_RESET before=200 reset=201 after=200 TOKEN_ANTIGO_VALIDO
  ```
- **Impacto:** por até 15 minutos, um token roubado continua acessando o painel
  mesmo após a senha ser trocada ou a conta ser bloqueada.
- **Arquivos:** `apps/api/src/auth/auth.service.ts`,
  `apps/api/src/common/auth.guard.ts`, `apps/api/src/common/permissions.guard.ts`.
- **Correção proposta:** `tokenVersion` no administrador (ou lista de revogação
  no Redis) incluído no JWT; incrementar em reset de senha, bloqueio, exclusão,
  mudança de grupos e logout global; validar no guard.

### AX-032 — Seed destrutivo e rotação de segredo de NAS

- **Causa raiz:** `seed.ts` atualiza `secretCipher`/`secretRotatedAt` de todos os
  NAS a cada execução, deleta políticas, apaga `radcheck`, `radreply`,
  `radusergroup`, `radgroupcheck` e `radgroupreply` e reconstrói o estado RADIUS.
- **Evidência:** linhas 231–273, 275 e 322–327 de `apps/api/prisma/seed.ts`.
- **Impacto:** executar o seed em um ambiente real derruba a autenticação de todos
  os NAS (segredo muda), apaga políticas e pode remover credenciais que não
  estejam em `users.radiusNtHash`.
- **Arquivos:** `apps/api/prisma/seed.ts`, `package.json`.
- **Correção proposta:** bloquear seed em `NODE_ENV=production` sem
  `SEED_ALLOW_DESTRUCTIVE=true`; no upsert, nunca rotacionar `secretCipher`;
  separar seed de demonstração de sincronização RADIUS.

### AX-033 — Segredo de NAS em log de erro

- **Causa raiz:** `RadiusService.onModuleInit` registra `error.message`; erros do
  Prisma podem incluir `DETAIL: Failing row contains (... secret ...)`. O filtro
  HTTP também registra `exception.stack` para erros inesperados.
- **Evidência:** observado durante a P2 no log da API, com a linha de falha do
  `nas` contendo o segredo em texto puro.
- **Impacto:** rotação de segredo, vazamento para logs, backups de log e
  ferramentas de observabilidade.
- **Arquivos:** `apps/api/src/radius/radius.service.ts`,
  `apps/api/src/common/http-exception.filter.ts`,
  `apps/api/src/common/audit.service.ts`, `apps/worker/src/index.ts`,
  `apps/api/prisma/seed.ts`.
- **Correção proposta:** utilitário de redaction (`password`, `secret`, `token`,
  `authorization`, `database_url`, `totp`) e logs apenas com código/tipo do erro;
  nunca logar `error.message` de query que contenha valores sensíveis.

### AX-034 — UDP RADIUS exposto em todas as interfaces

- **Causa raiz:** `docker-compose.yml` publica `1812:1812/udp` e `1813:1813/udp`
  sem IP de bind; o firewall do host não foi verificado.
- **Evidência:**
  ```text
  freeradius 0.0.0.0:1812-1813->1812-1813/udp, [::]:1812-1813->1812-1813/udp
  ```
- **Impacto:** qualquer host alcançável pode enviar Access-Request/Accounting;
  amplia superfície de DoS e de tentativa de autenticação. O `Message-Authenticator`
  está desativado (`RADIUS_REQUIRE_MA=false`), agravando Blast-RADIUS.
- **Arquivos:** `docker-compose.yml`, firewall do host.
- **Correção proposta:** bind em IP de gerência (`<IP>:1812:1812/udp`) ou firewall
  restrito aos IPs dos NAS; documentar e testar.

### AX-035 — IP de NAS duplicado

- **Causa raiz:** `devices`/`nas` não têm unicidade por IP; a API só valida
  duplicidade do curinga.
- **Evidência real:**
  ```text
  PROBE_NAS_DUP first=201 second=201 nas_rows=2 DUPLICADO
  ```
- **Impacto:** duas linhas `nas` para o mesmo IP, com segredos/grupos distintos;
  o FreeRADIUS escolhe uma linha sem ordenação determinística, podendo usar o
  segredo/grupo errado e causar indisponibilidade ou autorização indevida.
- **Arquivos:** `apps/api/src/devices/devices.service.ts`,
  `apps/api/src/devices/devices.dto.ts`, schema/migration.
- **Correção proposta:** validar IP único no service e criar índice único em
  `devices.nasIp` e `nas.nasname` após deduplicação.

### AX-036 — API com credenciais de superusuário e bootstrap

- **Causa raiz:** `docker-compose.yml` injeta `MIGRATE_DATABASE_URL` (usuário
  `aaa` superusuário) e `BOOTSTRAP_ADMIN_PASSWORD`/`BOOTSTRAP_ADMIN_TOTP_SECRET`
  no container da API em runtime.
- **Evidência:** `docker inspect` confirma as chaves no ambiente da API.
- **Impacto:** comprometimento da API entrega credencial de superusuário do
  PostgreSQL e segredos de bootstrap; o `unset` no entrypoint só remove do
  processo Node, não do ambiente do container.
- **Arquivos:** `docker-compose.yml`, `apps/api/Dockerfile`.
- **Correção proposta:** mover migrations/grants para um job one-shot com
  credencial própria; remover `MIGRATE_DATABASE_URL` do serviço `api`; remover
  segredos de bootstrap do runtime e usar profile/one-shot `bootstrap`.

### AX-037 — TOTP em texto puro

- **Causa raiz:** `Admin.totpSecret` é `String?` sem cifra.
- **Evidência:** 5 administradores com `totpSecret`; menor tamanho 16.
- **Impacto:** vazamento do banco/backup permite gerar códigos TOTP e bypassar o
  segundo fator.
- **Arquivos:** `apps/api/prisma/schema.prisma`, `auth.service.ts`,
  `scripts/bootstrap-admin.ts`, `scripts/mfa-code.ts`.
- **Correção proposta:** cifrar com AES-256-GCM usando `ENCRYPTION_KEY` e
  versionamento de chave; migrar segredos existentes.

### AX-038 — CLI `mfa-code` gera TOTP de administrador

- **Causa raiz:** `apps/api/scripts/mfa-code.ts` busca o primeiro administrador
  (ou `BOOTSTRAP_ADMIN_EMAIL`) e imprime o código TOTP atual.
- **Impacto:** qualquer acesso ao container/execução do script gera um segundo
  fator válido, contornando o MFA sem senha.
- **Correção proposta:** remover o script do runtime ou exigir
  `MFA_CODE_ALLOW=true` + confirmação explícita + auditoria; nunca imprimir em
  produção.

### AX-039 — Worker com acesso total a `users`

- **Causa raiz:** `GRANT SELECT, UPDATE ON users` concede todas as colunas.
- **Evidência:** `aaa_worker` tem SELECT/UPDATE em `radiusNtHash`, `email`,
  `status`, etc.
- **Impacto:** comprometimento do worker expõe hashes NT e permite alterar
  credenciais/status.
- **Arquivos:** `infra/postgres/runtime-grants.sql`.
- **Correção proposta:** grants por coluna: `SELECT (id, login, lastAuthAt,
  status, deletedAt, validFrom, validUntil)` e `UPDATE (lastAuthAt)` apenas.

### AX-040 — Configurações/políticas decorativas

- **Causa raiz:** `policies` só tem CRUD; FreeRADIUS não consulta a tabela.
  `passwordRotationDays` e `notificationsEmail` não são usados;
  `auditRetentionDays` é aplicado a `radpostauth`, não a `audit_events`.
- **Impacto:** falsa sensação de controle; retenção de auditoria não é cumprida.
- **Correção proposta:** implementar avaliação de políticas no FreeRADIUS ou
  remover a promessa da UI; aplicar retenção/arquivamento de auditoria; usar ou
  remover os campos decorativos.

### AX-041 — CSP permissiva

- **Causa raiz:** `script-src 'self' 'unsafe-inline' 'unsafe-eval'`.
- **Impacto:** reduz a mitigação de XSS; `unsafe-eval` permite execução de string
  como código se houver injeção.
- **Correção proposta:** remover `unsafe-eval` em produção, migrar scripts
  inline para nonce/hash e validar o build do Next.js.

### AX-042 — Refresh token sem binding

- **Causa raiz:** `RefreshToken.ip`/`userAgent` são gravados, mas não comparados
  no `refresh`.
- **Impacto:** token de refresh roubado pode ser usado de outro IP/dispositivo.
- **Correção proposta:** comparar IP/UA (com tolerância para mudança de rede) ou
  exigir reautenticação em mudança suspeita.

### AX-043 — Sessões RADIUS não revogadas em update

- **Causa raiz:** `users.update` sincroniza RADIUS/painel, mas não chama
  `sessions.revokeAllForUser` quando `status`, `validUntil` ou grupos mudam.
- **Impacto:** usuário bloqueado/expirado/removido de grupo por PATCH continua
  com sessão PPPoE/VPN ativa até o próximo accounting/CoA.
- **Correção proposta:** detectar mudanças de status/validade/grupos e revogar
  sessões + CoA; testar com sessão `radacct` real.

### AX-044 — Atributos RADIUS de grupo arbitrários

- **Causa raiz:** `groups.update` aceita qualquer nome `[A-Za-z0-9._-]` e grava
  em `radgroupreply` com `op '='`.
- **Impacto:** um perfil com `groups.write` pode injetar atributos de resposta
  perigosos (ex.: `Tunnel-*`, `Framed-IP-Address`, `Reply-Message`, `Auth-Type`
  dependendo do fluxo) e alterar comportamento de rede/autenticação.
- **Correção proposta:** allowlist por finalidade (reply) + denylist de
  atributos de controle (`Auth-Type`, `User-Password`, `NT-Password`,
  `Cleartext-Password`, `Crypt-Password`, `Expiration`, `Proxy-To-Realm`).

### AX-045 — Backups em texto puro

- **Causa raiz:** `pg_dump --clean` gera SQL com `nas.secret`, `totpSecret`,
  `radiusNtHash`, hashes de senha e metadados.
- **Impacto:** qualquer leitura do backup (ou de uma cópia) expõe credenciais
  RADIUS, TOTP e hashes.
- **Correção proposta:** cifrar backups (age/GPG/KMS), separar chave do host,
  testar restore cifrado e documentar rotação.

### AX-046 — Containers root/rootfs gravável

- **Causa raiz:** FreeRADIUS, nginx, PostgreSQL e Redis executam como root;
  apenas API/worker têm `read_only`; web não tem rootfs read-only.
- **Impacto:** comprometimento de um serviço tem mais privilégios e pode gravar
  no rootfs.
- **Correção proposta:** `USER` não-root onde possível, `read_only` + tmpfs,
  remover capabilities desnecessárias e validar com testes de autenticação.

### AX-047 — `auth_method` fixo

- **Causa raiz:** a query de `post-auth` grava `'mschapv2'` para qualquer método.
- **Impacto:** auditoria/forense registra PAP como MS-CHAPv2.
- **Correção proposta:** usar `%{control:Auth-Type}` ou `%{reply:Packet-Type}` /
  `%{auth:...}` conforme o método real.

### AX-048 — `/health` público custoso

- **Causa raiz:** `HealthController.check` público chama `HealthService.summary`,
  que executa `SELECT 1`, `redis.ping`, `COUNT(*)` em `radpostauth` e leitura no
  Redis a cada request.
- **Impacto:** DoS de baixo custo contra API/banco; revela mapa de serviços.
- **Correção proposta:** cache curto (ex.: 10 s), rate limit e resposta estática
  mínima para o público; detalhes só autenticados.

## Observações adicionais

| ID | Severidade | Observação | Status |
| --- | --- | --- | --- |
| AX-049 | Baixa | `POSTGRES_PASSWORD` tem default `change-me-in-env`; scripts de criação de papel interpolam senha em SQL (risco de quebra/injeção com aspas). | Corrigido (Bloco D) |
| AX-050 | Baixa | JWT sem `iss`, `aud` ou `jti`; rotação de `JWT_ACCESS_SECRET` não é versionada. | Corrigido (Bloco D) |
| AX-051 | Baixa | UI permite `sessionTimeoutMinutes`/`passwordMinLength` que o backend limita; valores exibidos não correspondem ao efetivo. | Corrigido (Bloco D) |
| AX-052 | Baixa | Redirecionamento HTTP do nginx usa `$host` (Host header), permitindo open redirect se o host for controlado. | Corrigido (Bloco D) |
| AX-053 | Info | `/health/details` informa FreeRADIUS 3.2.3, mas a stack roda 3.2.8. | Corrigido (Bloco D) |
| AX-054 | Info | `audit_events` cresce sem retenção/arquivamento; `auditRetentionDays` não o alcança. | Aceito/documentado (Bloco D) |
| AX-055 | Info | `RADIUS_REQUIRE_MA=false` permanece ativo por compatibilidade com Nokia. | Aceito/documentado |
| AX-056 | Info | 10 NAS migrados mantêm shared secret legado de 9 caracteres até janela de rotação. | Pendente (janela) |
| AX-057 | Info | `aaa` (owner/migrador) continua superusuário; runtime não usa esse papel. | Aceito/documentado |

## Plano P3 proposto

### Bloco A — Autenticação e sessões (prioridade máxima)

1. **AX-029:** validar status/validade da identidade no `mfa`.
2. **AX-030:** limite por desafio MFA + invalidação + auditoria.
3. **AX-031:** `tokenVersion`/lista de revogação de JWT e incremento em reset,
   bloqueio, exclusão e mudança de grupos.
4. **AX-043:** revogar sessões RADIUS em mudanças de status/validade/grupo.
5. Testes reais: MFA bloqueado, 5 erros + acerto, token antigo após reset,
   sessão ativa após PATCH de status.

### Bloco B — Segredos, banco e infraestrutura

1. **AX-032:** seed seguro (sem rotação de segredo, guard de produção).
2. **AX-033:** redaction de logs/erros.
3. **AX-035:** unicidade de IP de NAS (`devices.nasIp`/`nas.nasname`).
4. **AX-036:** remover `MIGRATE_DATABASE_URL` e segredos de bootstrap do runtime.
5. **AX-037/038:** cifrar TOTP e restringir/remover `mfa-code`.
6. **AX-039:** grants por coluna para o worker.
7. **AX-045:** backup cifrado com teste de restore.
8. **AX-046:** containers non-root/read-only onde viável.
9. **AX-034:** bind de UDP 1812/1813 em IP de gerência ou firewall restrito
   (requer o IP/CIDR de gerência dos NAS).

### Bloco C — Controles declarativos e headers

1. **AX-040:** políticas/settings efetivas ou remoção da promessa.
2. **AX-041:** CSP sem `unsafe-eval` em produção.
3. **AX-042:** binding de refresh token.
4. **AX-044:** allowlist/denylist de atributos RADIUS.
5. **AX-048:** cache/rate limit no `/health`.
6. **AX-047:** `auth_method` real.

### Bloco D — Baixo risco/documentação

- AX-049 a AX-054 (defaults, JWT claims, UI, nginx, versão, retenção).
- Resíduos AX-055 a AX-057 (MA, segredos legados, `aaa` superusuário).

## Itens que exigem decisão operacional

Antes de executar o Bloco B/C, preciso de definição sobre:

1. **IP/CIDR de gerência dos NAS** para bind/firewall de 1812/1813.
2. **Janela de rotação** de JWT, `ENCRYPTION_KEY`, TOTP, segredos de NAS e
   senha do PostgreSQL.
3. **Chave de backup** (age/GPG/KMS) e onde armazená-la fora do host.
4. **Escopo do motor de políticas**: quais políticas precisam ser realmente
   avaliadas no FreeRADIUS.
5. **`mfa-code`**: remover ou manter apenas como break-glass auditado.

## Conclusão

A stack mantém os controles P0/P1/P2, mas a auditoria P3 encontrou lacunas
relevantes de autenticação e operação. Os quatro achados confirmados
dinamicamente devem ser tratados antes de qualquer nova exposição do painel.
Nenhuma correção foi aplicada nesta etapa; o próximo passo é autorizar a
execução do Bloco A e definir os itens operacionais acima.
