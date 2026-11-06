# Remediação de segurança — P3 Bloco B

Data: 05/11/2026

Escopo executado: AX-032, AX-033, AX-035, AX-036, AX-037, AX-038,
AX-039, AX-045 e AX-046. AX-034 ficou pendente de definição do IP/CIDR de
gerência dos NAS.

## Resultado

| ID | Status | Correção |
| --- | --- | --- |
| AX-032 | Corrigido | Seed bloqueado em produção e não rotaciona mais o segredo de NAS existente. |
| AX-033 | Corrigido | Logs de erro usam resumo seguro; segredos do Prisma não são impressos. |
| AX-035 | Corrigido | IP de NAS é único no service e no banco (`devices.nasIp`/`nas.nasname`). |
| AX-036 | Corrigido | API runtime sem `MIGRATE_DATABASE_URL`/`BOOTSTRAP_*`; migrations em serviço one-shot. |
| AX-037 | Corrigido | Segredos TOTP cifrados com AES-256-GCM e prefixo `enc:v1:`. |
| AX-038 | Mitigado | `mfa-code` exige `MFA_CODE_ALLOW=true` e decifra o TOTP. |
| AX-039 | Corrigido | Worker com grants por coluna: não lê/altera `radiusNtHash`. |
| AX-045 | Corrigido | Backups cifrados com AES-256-CBC/PBKDF2 e restore real testado. |
| AX-046 | Mitigado | FreeRADIUS roda como usuário `freerad` (não root). |
| AX-034 | Pendente | Compose aceita `RADIUS_BIND_IP`; falta o IP/CIDR de gerência para aplicar. |

## Implementação

### AX-032 — Seed seguro

- `apps/api/prisma/seed.ts` bloqueia execução quando `NODE_ENV=production`,
  a menos que `SEED_ALLOW_DESTRUCTIVE=true`.
- O upsert de NAS não altera `secretCipher`/`secretRotatedAt` de equipamento
  existente; o segredo é decifrado apenas para sincronizar a tabela `nas`.
- O seed continua sendo uma ferramenta de demonstração: em produção, use-o
  apenas com autorização explícita.

### AX-033 — Redaction de logs

- Novo `apps/api/src/common/error.ts` com `errorSummary()`:
  - erros do Prisma são registrados apenas pelo código (`Prisma Pxxxx`);
  - mensagens com `Failing row contains`, `DETAIL`, SQL ou Prisma não são
    impressas;
  - pares `password/secret/token/totp/...` são redigidos.
- Aplicado em `RadiusService`, `UsersService`, `AuditService`,
  `HttpExceptionFilter`, worker, seed, bootstrap, `mfa-code` e rotação de
  segredos.

### AX-035 — Unicidade de IP de NAS

- `DevicesService.create` rejeita IP já cadastrado com HTTP 400.
- Migration `20261105160000_p3_unique_nas_ip` cria:
  - `devices_nasIp_unique`;
  - `nas_nasname_unique`.
- A migration falha com mensagem explícita se a base já tiver duplicidade.

### AX-036 — Runtime sem superusuário/bootstrap

- Novo serviço one-shot `migrate`:
  - executa `prisma migrate deploy`;
  - aplica `runtime-grants.sql`;
  - cifra segredos TOTP legados.
- A API depende de `migrate` concluir com sucesso e roda apenas com `aaa_app`.
- Novo serviço de perfil `tools` `bootstrap`:
  - usa `aaa_app`;
  - recebe `BOOTSTRAP_ADMIN_*` apenas no one-shot;
  - grava o TOTP em `bootstrap/totp.txt` (modo `600`).
- `apps/api/Dockerfile` executa apenas `node dist/main.js`.
- `docker inspect` da API não mostra mais `MIGRATE_DATABASE_URL`,
  `BOOTSTRAP_ADMIN_*` nem `POSTGRES_PASSWORD`.

### AX-037 — TOTP cifrado

- Novo `apps/api/src/common/totp-secret.ts`:
  - armazena `enc:v1:<AES-GCM>`;
  - mantém compatibilidade de leitura com segredos legados.
- Login, MFA, enrollment, criação de usuário, TOTP administrativo,
  bootstrap e `mfa-code` usam cifra/decifra.
- O serviço `migrate` executa `scripts/encrypt-totp-secrets.ts`; 5 segredos
  existentes foram convertidos, e hoje não há `totpSecret` em texto puro.

### AX-038 — `mfa-code` restrito

- `apps/api/scripts/mfa-code.ts` exige `MFA_CODE_ALLOW=true`.
- Sem a variável, o comando falha antes de buscar/gerar o código.
- O código é impresso apenas no modo break-glass explícito.

### AX-039 — Grants do worker

- `infra/postgres/runtime-grants.sql` agora concede ao `aaa_worker` apenas:
  - `SELECT (id, login, name, "lastAuthAt", status, "deletedAt", "validFrom", "validUntil")` em `users`;
  - `UPDATE ("lastAuthAt")` em `users`;
  - `SELECT, UPDATE` em `devices`.
- O worker não lê mais `users.radiusNtHash`, e-mail ou notas.

### AX-045 — Backup cifrado

- `scripts/backup.sh` gera `.sql.enc` com
  `openssl enc -aes-256-cbc -pbkdf2 -salt` e `BACKUP_ENCRYPTION_KEY`.
- `scripts/restore.sh` detecta `.enc`, decifra em arquivo temporário `600` e
  restaura; backups `.sql` antigos continuam suportados.
- Teste real: gera backup, decifra, cria banco temporário, restaura 111
  usuários, valida e remove o banco.

### AX-046 — FreeRADIUS non-root

- `infra/freeradius/Dockerfile` faz `chown` dos diretórios de configuração e
  define `USER freerad`.
- O processo roda como UID 101; o entrypoint continua escrevendo a
  configuração em `/etc/freeradius` com as permissões corretas.

### AX-034 — Bind RADIUS

- `docker-compose.yml` aceita `RADIUS_BIND_IP` (default `0.0.0.0`).
- Para fechar o achado, defina o IP de gerência ou restrinja UDP 1812/1813
  no firewall do host às redes dos NAS.

## Testes

```bash
pnpm test:security:p3
```

Executa:

- `p3-web.sh`: MFA bloqueado, limite por desafio, revogação JWT, sessões
  RADIUS e IP de NAS duplicado;
- `p3-db.sh`: TOTP cifrado, grants do worker, índices únicos, ambiente da API,
  usuário do FreeRADIUS, bloqueio do seed e do `mfa-code`;
- `p3-backup.sh`: cifra, decifração e restore real.

Evidências finais:

```text
PASS  todos os segredos TOTP estão cifrados
PASS  worker lê lastAuthAt
PASS  worker não lê radiusNtHash
PASS  índice único de IP de device existe
PASS  API runtime sem superusuário e sem segredos de bootstrap
PASS  FreeRADIUS roda como usuário freerad (não root)
PASS  seed destrutivo é bloqueado em produção
PASS  mfa-code exige MFA_CODE_ALLOW=true
PASS  segundo NAS com o mesmo IP é rejeitado
PASS  backup gerado em texto cifrado e modo 600
PASS  restauração real do backup em banco temporário (111 usuários)
```

Regressões:

```text
P0 aprovado
P1 web/DB aprovado
P2 aprovado
P3 Bloco A+B aprovado
```

Qualidade:

```text
pnpm typecheck ... ok
pnpm test ........ 37 API + 12 web
pnpm audit ....... 0 vulnerabilidades
```

## Impactos operacionais

- **Migrations:** agora rodam no serviço `migrate`; a API não executa DDL.
- **Bootstrap:** usar `docker compose --profile tools run --rm bootstrap`.
- **Seed:** bloqueado em produção; use `SEED_ALLOW_DESTRUCTIVE=true` somente em
  demonstração.
- **Backups:** novos backups são `.sql.enc`; `BACKUP_ENCRYPTION_KEY` deve ser
  guardada fora do host dos backups.
- **TOTP:** segredos existentes foram cifrados; o login MFA continua normal.
- **FreeRADIUS:** roda como `freerad`; arquivos copiados para `/tmp` por testes
  precisam de `chmod 644` (runners ajustados).
- **NAS:** o IP agora é único; equipamentos duplicados precisam ser resolvidos
  antes da migration.
- **RADIUS:** `RADIUS_BIND_IP` ainda está em `0.0.0.0` neste ambiente; AX-034
  permanece aberto até definir o IP/CIDR de gerência.

## Rollback

- **Banco pré-Bloco B:** `backups/aaa_manager-20261105T152157Z.sql`
- **Banco pós-Bloco B:** `backups/aaa_manager-20261105T155700Z.sql.enc`
- **Código pré-Bloco B:** `/tmp/opencode/aaa-manager-pos-p3.tar.gz`
- **Código pós-Bloco B:** `/tmp/opencode/aaa-manager-pos-p3b.tar.gz`
- **Migrations:** remover os índices únicos e reverter o código; a coluna
  `tokenVersion` pertence ao Bloco A.
- **Backups:** para voltar ao formato texto puro, restaurar `backup.sh` e
  `restore.sh` do snapshot anterior.

## Pendente

- AX-034: bind/firewall do RADIUS (requer IP/CIDR de gerência).
- Blocos C/D concluídos em `docs/SECURITY-P3-C-D.md`.
