# Remediação de segurança — P3 Blocos C e D

Data: 05/11/2026

Escopo executado: AX-040, AX-041, AX-042, AX-044, AX-047, AX-048 (Bloco C)
e AX-049 a AX-054 (Bloco D). Os resíduos AX-055 a AX-057 permanecem
documentados como itens operacionais.

## Resultado

| ID | Status | Correção |
| --- | --- | --- |
| AX-040 | Mitigado | Catálogo de políticas marcado como advisory; settings passam a persistir/exibir o valor efetivo; retenção de auditoria deixou de ser prometida. |
| AX-041 | Corrigido | CSP de produção e do Next.js não usa mais `unsafe-eval`. |
| AX-042 | Corrigido | Refresh token vinculado a User-Agent e IP, com revogação da família em caso de divergência. |
| AX-044 | Corrigido | Allowlist/denylist de atributos RADIUS de resposta; atributos de controle e de rede são rejeitados. |
| AX-047 | Corrigido | `radpostauth.auth_method` usa o `Auth-Type` real do FreeRADIUS. |
| AX-048 | Corrigido | `/health` público tem cache de 10 s e rate limit de 60 req/min por IP; detalhes continuam autenticados. |
| AX-049 | Corrigido | Compose exige `POSTGRES_PASSWORD`; criação de papéis usa `format(%L)` e variáveis do psql. |
| AX-050 | Corrigido | JWT com `iss`, `aud`, `jti` e validação de algoritmo/claims. |
| AX-051 | Corrigido | Backend persiste timeout entre 5–15 min e senha mínima ≥14; UI exibe o valor efetivo. |
| AX-052 | Corrigido | Rede de produção usa `PUBLIC_HOST` no redirect/`server_name`; Host desconhecido recebe 444. |
| AX-053 | Corrigido | `/health/details` informa FreeRADIUS 3.2.8. |
| AX-054 | Aceito/documentado | `audit_events` é imutável e sem expurgo; a retenção configurável vale para `radpostauth`/`radacct`. |

## Implementação — Bloco C

### AX-040 — Controles declarativos

- A UI de políticas agora descreve o catálogo como **advisory**. A autorização
  efetiva continua sendo feita pelo FreeRADIUS (grupos, validade e acesso por
  equipamento).
- `SettingsService.update` persiste o valor efetivo:
  - `sessionTimeoutMinutes` limitado a 5–15;
  - `passwordMinLength` elevado para no mínimo 14.
- A UI mostra que o timeout/senha são limitados pelo backend.
- `auditRetentionDays` foi renomeado na UI para retenção de autenticações
  RADIUS; a trilha `audit_events` é append-only e não é expurgada.

### AX-041 — CSP

- `infra/nginx/nginx.conf` e `infra/nginx/nginx.tls.conf` não incluem
  `unsafe-eval`.
- `apps/web/next.config.ts` só adiciona `unsafe-eval` fora de produção
  (necessário para o modo de desenvolvimento do Next.js).
- `script-src 'unsafe-inline'` permanece porque o Next.js injeta scripts de
  bootstrap inline; a migração para nonce/hash fica como evolução futura.

### AX-042 — Binding de refresh token

- `AuthService.refresh` compara `RefreshToken.userAgent` e `RefreshToken.ip`
  com a requisição atual.
- Divergência revoga toda a família de refresh tokens, incrementa
  `admins.tokenVersion` e audita `auth.refresh.rejected`.
- `REFRESH_BIND_IP=false` desativa apenas a comparação de IP para redes com
  CGNAT; o User-Agent continua obrigatório.

### AX-044 — Atributos RADIUS

- Novo `apps/api/src/groups/radius-attributes.ts`.
- Allowlist cobre os atributos dos perfis atuais (`Session-Timeout`,
  `Idle-Timeout`, `Acct-Interim-Interval`, `Framed-Protocol`, `Filter-Id`,
  VSAs Mikrotik/Cisco/Huawei/Juniper/Fortinet/Aruba/H3C).
- Denylist explícita bloqueia `Auth-Type`, hashes/senhas, `Expiration`,
  `Proxy-To-Realm`, `Framed-IP-Address`, `Reply-Message` e `Class`.
- Valores com `\r`, `\n` ou `\0` são rejeitados.

### AX-047 — `auth_method` real

- `infra/freeradius/patch-queries.pl` grava
  `COALESCE(NULLIF('%{control:Auth-Type}', ''), 'unknown')`.
- Validação real: `radtest` MS-CHAP gerou `auth_method = mschap` em
  `radpostauth`.

### AX-048 — `/health`

- `HealthService.summary` usa cache de 10 s.
- `RateLimitService.health` aplica 60 requisições/min por IP.
- A resposta pública continua sem versões, latências ou detalhes internos;
  `/health/details` exige `settings.read`.

## Implementação — Bloco D

### AX-049 — Credenciais de papéis

- `docker-compose.yml` exige `POSTGRES_PASSWORD` (sem default
  `change-me-in-env`).
- `infra/postgres/init/00-roles.sh` usa variáveis do psql e `format(%L)` em vez
  de interpolar a senha dentro do SQL.

### AX-050 — Claims do JWT

- Access token inclui `iss`, `aud`, `jti` e é assinado com HS256 explícito.
- `AuthGuard` valida `issuer`, `audience` e `algorithms`.
- `JWT_ISSUER` e `JWT_AUDIENCE` são configuráveis; os defaults são
  `axis-aaa`/`axis-panel`.
- A revogação continua via `admins.tokenVersion` (`ver` no token).

> Tokens emitidos antes desta mudança não têm `iss`/`aud` e passam a ser
> rejeitados; os usuários precisam entrar novamente após o deploy.

### AX-051 — Settings efetivas

- Backend persiste os valores limitados; a UI mostra o valor efetivo e avisa
  que a rotação de senha ainda é apenas indicador operacional.

### AX-052 — Redirect do nginx

- `docker-compose.prod.yml` renderiza `infra/nginx/nginx.tls.conf` com
  `PUBLIC_HOST`.
- O redirect HTTP usa `https://$PUBLIC_HOST`, nunca o header Host do cliente.
- Hosts desconhecidos em HTTP/HTTPS recebem `444`.
- O certificado TLS deve cobrir `PUBLIC_HOST`.

### AX-053 — Versão do FreeRADIUS

- `/health/details` passou a informar 3.2.8.

### AX-054 — Retenção da auditoria

- `audit_events` permanece append-only por decisão de segurança; não há expurgo
  automático nem promessa de retenção na UI.
- `auditRetentionDays` continua aplicado a `radpostauth`; `sessionRetentionDays`
  a `radacct`.

## Testes

```bash
pnpm test:security:p3
pnpm test:security:p0
```

Cobertura nova em `apps/api/scripts/security-p3-web.mjs`:

```text
PASS  JWT contém issuer esperado
PASS  JWT contém audience esperada
PASS  JWT contém jti único
PASS  timeout efetivo é limitado a 15 minutos
PASS  senha mínima efetiva é 14
PASS  refresh token rejeitado em outro dispositivo (User-Agent)
PASS  access token revogado após uso suspeito do refresh
PASS  atributo de controle RADIUS é rejeitado
PASS  Framed-IP-Address manual é rejeitado
PASS  valor com quebra de linha é rejeitado
PASS  health público aplica rate limit por IP
```

Cobertura nova em `scripts/security/p3-db.sh` e `p0-radius.sh`:

```text
PASS  CSP sem unsafe-eval
PASS  auth_method RADIUS real (mschap)
```

Regressões executadas:

```text
P0 aprovado
P1 web/DB aprovado
P2 aprovado
P3 Bloco A+B+C+D aprovado
TLS/HSTS/cookies aprovado
```

## Impactos operacionais

- **Produção TLS:** definir `PUBLIC_HOST` (e `PUBLIC_ORIGIN`) com o domínio
  público; o certificado precisa corresponder a esse host.
- **JWT:** todos os access tokens antigos são invalidados após o deploy.
- **Refresh:** mudança de IP/User-Agent encerra a família de tokens; em CGNAT,
  avalie `REFRESH_BIND_IP=false`.
- **Grupos RADIUS:** atributos fora da allowlist passam a retornar HTTP 400.
  Perfis existentes com atributos personalizados precisam ser revisados antes
  de editar o grupo.
- **Health:** o endpoint público limita 60 req/min por IP; monitores externos
  devem usar intervalo compatível.
- **Auditoria:** não há expurgo de `audit_events`; planeje arquivamento externo
  se o volume crescer.
- **Papéis PostgreSQL:** o script de init só roda em volume novo. Em bases
  existentes, a rotação continua via `ALTER ROLE` na janela de manutenção.

## Rollback

- **Banco pós-Bloco B:** `backups/aaa_manager-20261105T155700Z.sql.enc`.
- **Banco pós-Bloco C/D:** `backups/aaa_manager-20261105T191557Z.sql.enc`.
- **Código pós-Bloco B:** `/tmp/opencode/aaa-manager-pos-p3b-final2.tar.gz`.
- **Código pós-Bloco C/D:** `/tmp/opencode/aaa-manager-pos-p3cd.tar.gz`.
- **CSP:** restaurar o header anterior em nginx/Next.js se o build precisar de
  `unsafe-eval` (não esperado em produção).
- **JWT:** reverter `iss`/`aud` e o guard; tokens antigos voltam a ser aceitos.
- **Refresh:** remover a comparação de IP/UA se houver falso positivo.
- **Atributos RADIUS:** remover a allowlist e restaurar a validação anterior.
- **Nginx:** voltar o mount de `nginx.tls.conf` para `/etc/nginx/nginx.conf`.

## Pendências

- **AX-034:** bind/firewall de UDP 1812/1813 (requer IP/CIDR de gerência).
- **AX-055:** `RADIUS_REQUIRE_MA=false` por compatibilidade com Nokia; RADSec é
  a evolução recomendada.
- **AX-056:** 10 NAS ainda usam shared secret legado de 9 caracteres até a
  janela de rotação.
- **AX-057:** o papel `aaa` continua owner/migrador; runtime usa apenas
  `aaa_app`, `aaa_worker` e `aaa_radius`.
- Rotação histórica de `JWT_ACCESS_SECRET`, `ENCRYPTION_KEY`, TOTP, senha do
  PostgreSQL e segredos dos NAS continua pendente de janela.
