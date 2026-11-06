# Operação

## Subir e acompanhar

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f api
docker compose logs -f freeradius
docker compose logs -f worker
```

O comando de subida executa `prisma migrate deploy` antes de iniciar a API. O seed e o bootstrap são comandos separados.

## Primeira instalação

```bash
cp .env.example .env
chmod 600 .env
# edite os segredos; gere com openssl rand
docker compose up -d --build

export BOOTSTRAP_ADMIN_EMAIL=admin@seudominio.local
export BOOTSTRAP_ADMIN_PASSWORD="$(openssl rand -base64 24)"
docker compose --profile tools run --rm bootstrap
chmod 600 bootstrap/totp.txt
```

O `docker compose up` executa o serviço `migrate` (migrations + grants + cifra
TOTP) antes da API. O bootstrap grava o segredo em `bootstrap/totp.txt` (modo
`600`) e não o imprime. O bootstrap não recria administrador se já existir.
Remova o arquivo do TOTP depois de cadastrar o autenticador.

O seed é apenas para demonstração; não o execute em produção:

```bash
docker compose run --rm -e NODE_ENV=development migrate \
  sh -c './node_modules/.bin/tsx prisma/seed.ts'
```

## Migrations

O serviço `migrate` roda migrations, grants e a cifra dos segredos TOTP:

```bash
docker compose run --rm migrate
```

Para criar uma migration durante o desenvolvimento:

```bash
docker compose run --rm --entrypoint sh migrate \
  -c './node_modules/.bin/prisma migrate dev'
```

## Backup e restauração

Os backups são cifrados com AES-256-CBC/PBKDF2 usando
`BACKUP_ENCRYPTION_KEY`. Guarde a chave fora do host dos backups.

```bash
./scripts/backup.sh
./scripts/restore.sh backups/aaa_manager-20261106T005902Z.sql.enc
```

Os backups antigos em texto puro foram removidos. Use apenas `.sql.enc` e
mantenha `BACKUP_ENCRYPTION_KEY` fora do host.

O backup usa `pg_dump --clean --if-exists`. A restauração exige digitar `RESTAURAR` e substitui os dados do banco principal. O procedimento foi testado restaurando em um banco temporário e conferindo a contagem de identidades.

Recomendações:

- Agende backups fora do horário de maior movimento.
- Guarde o arquivo fora do host do banco.
- Teste a restauração trimestralmente.
- O `.env` e os backups não devem ser versionados.

## Adicionar ou rotacionar NAS

1. Cadastre o equipamento no painel. Escolha gerar um segredo ou informar o que já está configurado; o valor aparece uma única vez.
2. Aplique o segredo no equipamento.
3. Valide a autenticação a partir do próprio NAS.

O FreeRADIUS resolve os clientes pela tabela `nas` em tempo real. Não é necessário reiniciar após cadastrar um equipamento. Rotação de segredo e exclusão passam a valer em até 60 segundos, por causa do cache de clientes dinâmicos.

Grupos autorizados são aplicados na hora. Atributos de resposta são editados em **Grupos**, não no equipamento, e também entram em vigor imediatamente.

### Cadastro de NAS

Cadastre cada equipamento com o IP exato e escolha os grupos autorizados. O modo curinga `0.0.0.0/0` fica desabilitado por padrão.

- Para uma transição consciente, defina `RADIUS_ALLOW_WILDCARD_NAS=true` e crie um único NAS `0.0.0.0/0`.
- IPs cadastrados individualmente sempre têm precedência e usam o próprio segredo/grupos.
- O modo curinga compartilha um único segredo entre todos os equipamentos e não deve ser usado em produção.
- Segredos novos ou rotacionados exigem 16–60 caracteres; segredos legados devem ser rotacionados em janela de manutenção.

### CoA/Disconnect

Ao encerrar uma sessão, a API envia um Disconnect-Request RFC 5176 diretamente ao IP do NAS na porta UDP 3799. O equipamento precisa aceitar CoA e liberar essa porta para o IP de origem da API, que no Docker é o IP do host após o NAT. O shared secret é o mesmo já cadastrado para o NAS.

No MikroTik, o IP de origem do CoA precisa ser o mesmo endereço configurado em `/radius`. Se o RADIUS autentica pelo IP público e o CoA sai pelo IP da LAN, o RouterOS conta Bad Requests e descarta o pedido. Use o mesmo IP nos dois sentidos ou adicione uma entrada de servidor RADIUS com o IP de origem do CoA.

Se a porta estiver bloqueada ou o equipamento não suportar CoA, o painel encerra apenas o accounting e retorna `coaStatus: "timeout"` ou `"nak"`.

### Relógio e NTP

O accounting usa o horário de recebimento do servidor FreeRADIUS como referência de início e fim. Verifique `date -u` no host e `/system clock print` no MikroTik, e mantenha NTP ativo nos dois. Um NAS com clock em 1970 deixa de contaminar o início da sessão no painel, mas ainda deve ser corrigido para os logs e certificados do próprio equipamento.

## Redes Docker

O compose fixa:

- `192.168.240.0/24` para Nginx, web e API.
- `192.168.241.0/24` para a rede interna.
- `192.168.242.0/24` para a borda RADIUS.

Isso evita conflito com equipamentos em `172.16.0.0/12`. O FreeRADIUS resolve os NAS pela tabela `nas` e aceita apenas o cliente estático `127.0.0.1`, usado por `radtest`. Restrinja UDP 1812 e 1813 na borda às redes de gerência dos equipamentos.

## Testar RADIUS

```bash
./scripts/radius-smoke.sh
```

## Atualização

```bash
git pull
docker compose build
docker compose up -d
docker compose exec api ./node_modules/.bin/prisma migrate deploy
```

Verifique `docker compose ps`, os logs da API e o endpoint `/api/v1/health`.

## Recuperação

- Banco indisponível: restaure o último backup e suba `postgres`, `api` e `worker`.
- Redis perdido: reinicie `redis` e `worker`; filas e desafios MFA são recriados.
- FreeRADIUS com configuração inválida: `docker compose exec freeradius freeradius -XC` e corrija o primeiro erro.
- Administrador perdido: restaure o banco ou crie uma recuperação controlada com acesso direto ao PostgreSQL. Não existe rota pública de reset de administrador.
- Segredo de NAS perdido: rotacione no painel, aplique no equipamento e reinicie o FreeRADIUS.

## TLS em produção

O compose entrega HTTP em `8080` para desenvolvimento. Em produção:

1. Termine TLS no Nginx com certificado válido para `PUBLIC_HOST`.
2. Defina `PUBLIC_HOST` (domínio) e `PUBLIC_ORIGIN` (URL completa com HTTPS).
3. Redirecione HTTP para HTTPS e habilite HSTS; hosts desconhecidos recebem 444.
4. Defina `COOKIE_SECURE=true`.
5. Restrinja `CORS_ORIGINS` ao domínio do painel.
6. Não publique PostgreSQL, Redis, API ou web diretamente.
7. Publique apenas `443` e as portas RADIUS necessárias na rede de gerência.

Após o deploy do Bloco C/D, os access tokens emitidos antes das claims
`iss`/`aud` são rejeitados; os usuários precisam entrar novamente.

## Saúde e métricas

`GET /api/v1/health` é público, tem cache de 10 s e rate limit de 60 req/min por IP; informa API, PostgreSQL, Redis, FreeRADIUS (com base na última atividade registrada) e heartbeat do worker.

O worker grava `worker:heartbeat` no Redis a cada minuto. Ausência do heartbeat marca o serviço como degradado.

## Retenção

- `radacct` encerrado: removido após `sessionRetentionDays`.
- `radpostauth`: removido após `auditRetentionDays`.
- `audit_events`: append-only por trigger e sem expurgo automático. A UI não promete mais retenção para essa trilha; arquivamento externo é recomendado.
