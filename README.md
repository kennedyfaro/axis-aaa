# Áxis

Plataforma de controle AAA para identidades, autorização RADIUS, VPN, accounting e auditoria de acesso a equipamentos de rede.

O produto gerencia autenticação de rede via FreeRADIUS, incluindo grupos VPN PPTP/L2TP, pools de IP e a trilha administrativa do painel.

O projeto é um monorepo com frontend Next.js, API NestJS, worker BullMQ, PostgreSQL com migrations Prisma e FreeRADIUS 3.2 usando o schema SQL real. A autenticação RADIUS foi testada com `radtest` e o accounting com `radclient`.

## Instalação com Docker

Pré-requisitos: Docker Engine, Docker Compose v2 e as portas `8080`/`1812`/`1813` livres (ou ajuste no `.env`).

```bash
cp .env.example .env
chmod 600 .env
```

Gere segredos fortes e edite o `.env`:

```bash
openssl rand -hex 24   # POSTGRES_PASSWORD e senhas dos papéis
openssl rand -hex 32   # JWT_ACCESS_SECRET, ENCRYPTION_KEY, RADIUS_CLIENT_SECRET
openssl rand -hex 32   # BACKUP_ENCRYPTION_KEY
```

Suba a stack:

```bash
docker compose up -d --build
```

O serviço `migrate` executa migrations, grants e cifra dos segredos TOTP antes de iniciar a API.

Crie o primeiro administrador:

```bash
export BOOTSTRAP_ADMIN_EMAIL=admin@seudominio.local
export BOOTSTRAP_ADMIN_PASSWORD="$(openssl rand -base64 24)"
docker compose --profile tools run --rm bootstrap
```

O bootstrap grava o segredo TOTP em `bootstrap/totp.txt` com modo `600` e mostra apenas o caminho. Cadastre o segredo no autenticador e remova o arquivo depois:

```bash
chmod 600 bootstrap/totp.txt
rm -f bootstrap/totp.txt
```

Acesse `http://localhost:8080` (ou a porta definida em `HTTP_PORT`).

- OpenAPI: `http://localhost:8080/api/docs` quando `ENABLE_API_DOCS=true` em desenvolvimento.
- Saúde: `http://localhost:8080/api/v1/health`
- RADIUS: UDP `1812` e `1813`

O seed é opcional e destinado a demonstração; não o execute em produção:

```bash
docker compose run --rm -e NODE_ENV=development migrate \
  sh -c './node_modules/.bin/tsx prisma/seed.ts'
```

## Produção

Use o override de produção com TLS:

```bash
export PUBLIC_HOST=axis.seudominio.com
export PUBLIC_ORIGIN=https://axis.seudominio.com
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Coloque `fullchain.pem` e `privkey.pem` em `infra/nginx/tls/`. Defina também:

```env
COOKIE_SECURE=true
RADIUS_BIND_IP=IP_DE_GERENCIAMENTO
RADIUS_REQUIRE_MA=true
```

Mantenha `RADIUS_ALLOW_WILDCARD_NAS=false` e cadastre cada NAS por IP exato. O modo `0.0.0.0/0` é opt-in, apenas para transição controlada.

O arquivo `.env` é ignorado pelo Git, mas continua sendo um cofre local em texto puro. Mantenha-o com modo `600`, fora de snapshots/backups de código, ou use Vault/Docker secrets/KMS.

## Teste RADIUS real

```bash
./scripts/radius-smoke.sh
```

O script usa `RADIUS_TEST_USER` e `RADIUS_TEST_PASSWORD` de uma identidade criada no painel, verifica Access-Accept, Access-Reject com senha errada e um ciclo Start, Interim e Stop no accounting. O seed não cria mais usuário de teste com senha padrão.

## Capturas de tela

As capturas não são versionadas por poderem conter dados de demonstração. Gere-as localmente ou publique versões sanitizadas em `docs/screenshots/`.

## Stack

| Camada | Tecnologia |
| --- | --- |
| Web | Next.js 16.4.3, React 19, Tailwind 4, shadcn/ui sobre Radix, TanStack Query |
| API | NestJS 11, class-validator, Swagger, JWT, Argon2id, TOTP |
| Banco | PostgreSQL 17, Prisma 6.19, migrations versionadas |
| RADIUS | FreeRADIUS 3.2.8, rlm_sql_postgresql, MS-CHAPv2 com NT-Password |
| Filas | Redis 8, BullMQ 5, worker separado |
| Proxy | Nginx 1.27 |
| Testes | Vitest, Playwright |

## Funcionalidades

- Login administrativo com Argon2id, TOTP obrigatório, access token de 15 minutos com `iss`/`aud`/`jti`, refresh token com rotação, detecção de reuso e binding de IP/User-Agent.
- RBAC aplicado no backend por permissões de grupo, com CSRF double-submit em mutações.
- CRUD de identidades com credencial RADIUS NT-Password, validade, bloqueio, revogação de sessões, exclusão lógica, CSV e auditoria.
- Grupos com permissões de painel e atributos RADIUS por grupo.
- Identidades RADIUS em grupos com permissões administrativas entram no painel com a mesma senha do RADIUS e MFA obrigatório quando **Exigir MFA** está ligado. No primeiro login sem TOTP, o painel conduz o enrollment do autenticador. Perfis apenas de autoatendimento continuam com TOTP opcional.
- Portal de autoatendimento para Acesso Full e Acesso de Visualização: cada identidade vê e edita apenas o próprio perfil, troca a própria senha e encerra as próprias sessões, sem alterar grupos ou atributos.
- Catálogo de políticas com prioridade, escopo e ativação; a autorização efetiva é aplicada pelo FreeRADIUS (catálogo advisory).
- NAS clients com shared secret gerado pelo painel ou informado pelo operador, cifrado com AES-256-GCM e sincronizado para a tabela `nas`, incluindo exclusão do inventário e do cliente RADIUS. O FreeRADIUS resolve clientes dinamicamente, sem restart ao cadastrar um equipamento.
- NAS cadastrados por IP exato. O modo curinga `0.0.0.0/0` existe apenas para transição explícita e fica desabilitado por padrão.
- Permissões de acesso por equipamento: somente identidades dos grupos autorizados autenticam naquele NAS.
- Atributos RADIUS por grupo, editáveis no painel, com allowlist de atributos de resposta e aplicação em tempo real pelo FreeRADIUS.
- Grupos **VPN PPTP** e **VPN L2TP** com `Framed-Protocol=PPP`; identidades em vários grupos recebem a soma dos atributos, permitindo o mesmo usuário no login do equipamento e nos túneis PPTP/L2TP.
- Autorização separada por tipo de sessão: grupo VPN libera PPP, mas login de gerência (WinBox/SSH) exige um grupo não-VPN autorizado no NAS.
- Pools de IP em **Rede → Pools de IP**: faixas IPv4, vínculo de um endereço livre por identidade VPN e publicação automática de `Framed-IP-Address` no RADIUS.
- FreeRADIUS com autorização por grupo, accounting Start/Interim/Stop e `radpostauth` sem senha em texto puro.
- Sessões lidas do `radacct`, com encerramento administrativo e envio de Disconnect-Request (CoA/RFC 5176) ao NAS.
- Dashboard com métricas reais, série de autenticações, saúde dos serviços e credenciais expirando.
- Auditoria append-only com trigger no PostgreSQL que bloqueia UPDATE e DELETE, incluindo logins RADIUS aceitos/rejeitados e início/encerramento de sessões.
- Configurações de segurança, retenção, notificações e saúde.
- Worker de manutenção: presença, limpeza de accounting e alertas de expiração.

## Redes Docker

As redes do compose foram fixadas para não conflitar com a faixa `172.16.0.0/12` usada pelos equipamentos gerenciados:

| Rede | Subnet | Serviços |
| --- | --- | --- |
| `public` | `192.168.240.0/24` | Nginx, web, API |
| `internal` | `192.168.241.0/24` | API, worker, PostgreSQL, Redis, FreeRADIUS |
| `radius_edge` | `192.168.242.0/24` | FreeRADIUS e porta UDP publicada |

O bridge padrão do Docker nesta máquina já está em `192.168.250.0/24`. Nenhuma rota Docker em `172.x` permanece ativa. Se a sua LAN já usar `192.168.240.0/22`, ajuste as três subnets no `docker-compose.yml` antes de subir.

## Estrutura

```text
aaa-manager/
├── apps/
│   ├── api/                  NestJS, Prisma, autenticação, RBAC e RADIUS
│   ├── worker/               BullMQ e manutenção
│   └── web/                  Next.js
├── packages/contracts/       Tipos e schemas compartilhados
├── infra/
│   ├── freeradius/           Imagem, clientes e módulo SQL
│   └── nginx/                Proxy reverso
├── docs/                     Arquitetura, API, RADIUS, operação e segurança
├── scripts/                  RADIUS smoke, backup e restauração
├── docker-compose.yml
└── .env.example
```

## Desenvolvimento local

```bash
docker compose up -d postgres redis
cp apps/api/.env.example apps/api/.env
cp apps/worker/.env.example apps/worker/.env
cp apps/web/.env.example apps/web/.env.local

pnpm install
pnpm --filter @aaa/api prisma:generate
pnpm --filter @aaa/api prisma:deploy
pnpm --filter @aaa/api prisma:seed
pnpm --filter @aaa/api bootstrap
MFA_CODE_ALLOW=true pnpm --filter @aaa/api mfa:code
```

Em terminais separados:

```bash
pnpm dev:api      # API em 3000
pnpm dev:worker   # worker
pnpm dev          # web em 3100, proxy para a API
```

Para testar RADIUS fora do compose, o FreeRADIUS pode ser iniciado com os mesmos templates de `infra/freeradius` apontando para o PostgreSQL local.

## Scripts

| Comando | Função |
| --- | --- |
| `pnpm build` | Compila API, worker e web |
| `pnpm typecheck` | Tipagem dos três apps |
| `pnpm lint` | ESLint do frontend |
| `pnpm test` | Testes unitários da API e do web |
| `pnpm test:e2e` | 5 fluxos Playwright contra o compose em `localhost:8080` |
| `pnpm test:security:p0` | Regressões de segurança P0 com API/DB/RADIUS reais |
| `pnpm test:security:p1` | Regressões P1 (XFF, auditoria, CSV, lockout, sessões, headers, papéis) |
| `pnpm test:security:p2` | Regressões P2 (notificações, validade, NAS exato, auditoria append-only, alertas) |
| `pnpm test:security:p3` | Regressões P3 Blocos A+B+C+D (MFA, revogação JWT, sessões RADIUS, atributos, CSP, refresh binding e backups) |
| `pnpm test:security:tls` | TLS, HSTS e cookies Secure na stack de produção |
| `pnpm security:sbom` | Gera SBOM CycloneDX em `sbom/axis-aaa.cdx.json` |
| `pnpm db:seed` | Seed de grupos, identidades, NAS e políticas (sem credenciais padrão) |
| `pnpm db:bootstrap` | Cria o primeiro administrador |
| `./scripts/radius-smoke.sh` | Autenticação e accounting reais |
| `./scripts/backup.sh` | Backup SQL do PostgreSQL |
| `./scripts/restore.sh` | Restauração com confirmação explícita |

## Verificação executada

- Build de produção dos três apps.
- `docker compose up -d --build` com 7 containers saudáveis.
- Migrations aplicadas em banco limpo.
- Bootstrap do administrador e login com TOTP.
- RADIUS Access-Accept, Access-Reject, bloqueio de conta, reset de credencial e accounting.
- Backup e restauração testados em um banco temporário.
- 37 testes unitários da API e 12 do web passando; regressões P0/P1/P2/P3 em `scripts/security`.

## Segurança e limites

Os controles e as lacunas estão em [docs/SECURITY.md](docs/SECURITY.md), [docs/LIMITATIONS.md](docs/LIMITATIONS.md), [docs/SECURITY-P0.md](docs/SECURITY-P0.md), [docs/SECURITY-P1.md](docs/SECURITY-P1.md), [docs/SECURITY-P2.md](docs/SECURITY-P2.md), [docs/SECURITY-P3-AUDIT.md](docs/SECURITY-P3-AUDIT.md), [docs/SECURITY-P3.md](docs/SECURITY-P3.md), [docs/SECURITY-P3-B.md](docs/SECURITY-P3-B.md) e [docs/SECURITY-P3-C-D.md](docs/SECURITY-P3-C-D.md). Pontos importantes:

- MS-CHAPv2 com NT-Password; PAP também aceita NT-Password no schema atual. EAP-TLS não está configurado.
- CoA/Disconnect (RFC 5176) é enviado ao NAS; o encerramento no accounting é o fallback quando o NAS não responde.
- NAS são resolvidos pela tabela `nas` em tempo real: cadastro é imediato; rotação de segredo e exclusão valem em até 60 segundos.
- O NAS curinga (`0.0.0.0/0`) é opt-in e fica desabilitado por padrão. Cada equipamento deve ser cadastrado com o IP exato; para habilitar conscientemente, use `RADIUS_ALLOW_WILDCARD_NAS=true` e um shared secret forte e exclusivo.
- Segredos novos ou rotacionados exigem 16 a 60 caracteres. Segredos legados de NAS podem permanecer temporariamente até a janela de rotação.
- A trilha de auditoria é append-only no banco (UPDATE, DELETE e TRUNCATE são bloqueados).
- Segredos TOTP são cifrados com AES-256-GCM; backups são cifrados com `BACKUP_ENCRYPTION_KEY`.
- O worker tem grants por coluna e não acessa hashes de senha; gera alertas de segurança no painel e, se configurado, envia webhook HTTPS.
- O IP de cada NAS é único; a API e o banco rejeitam duplicidade.
- `RADIUS_REQUIRE_MA` controla a exigência de `Message-Authenticator` nos NAS. O padrão é `true`; no ambiente atual está `false` por compatibilidade com o Nokia SR1/BNG, o que mantém o Blast-RADIUS possível nesses equipamentos. Restrinja UDP 1812/1813 por firewall aos IPs dos NAS confiáveis.
- O compose padrão usa HTTP na porta 8080 para desenvolvimento. Para produção use `docker-compose.prod.yml` com `COOKIE_SECURE=true`, TLS, HSTS e `PUBLIC_HOST`/`PUBLIC_ORIGIN` (veja `infra/nginx/tls/README.md`).
- O login de uma identidade RADIUS no painel valida o NT-Password. O hash NT é mais fraco que Argon2; um vazamento do banco permite ataque offline. Use MFA e senhas longas.
- Condições arbitrárias de política ainda não são avaliadas pelo FreeRADIUS. Autorização por grupo, validade e bloqueio são aplicadas; o catálogo é advisory.
- O `/health` público tem cache de 10 s e rate limit de 60 req/min por IP. Detalhes ficam em `/health/details`, autenticado.

## Documentação

- [Arquitetura e design](docs/DESIGN.md)
- [API e autenticação](docs/API.md)
- [RADIUS e FreeRADIUS](docs/RADIUS.md)
- [Operação e recuperação](docs/OPERATIONS.md)
- [Segurança](docs/SECURITY.md)
- [Roadmap](docs/ROADMAP.md)
- [Limitações](docs/LIMITATIONS.md)
