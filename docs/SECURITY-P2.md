# Remediação de segurança — fase P2

Data: 05/11/2026

Escopo: AX-018, AX-020, AX-021, AX-022, AX-023, AX-024, AX-025, AX-026, AX-027 e AX-028.
Nenhuma migration já aplicada foi alterada. Foi adicionada uma migration nova
(`20261105140000_p2_security_hardening`).

## Resultado por item

| ID | Status | Correção |
| --- | --- | --- |
| AX-018 | Corrigido | `/notifications` exige autenticação e `users.read`; marcar como lida exige `settings.write`. |
| AX-020 | Corrigido | Curinga `0.0.0.0/0` desabilitado por padrão; NAS reais migrados para IP exato; registro curinga removido. |
| AX-021 | Corrigido | `PermissionsGuard` valida `status`, `deletedAt`, `validFrom` e `validUntil` da identidade vinculada em cada requisição. |
| AX-022 | Corrigido | Seed não cria mais `radius.test` nem senha padrão; upsert não reativa contas nem redefine credenciais. |
| AX-023 | Corrigido | Trigger `audit_events_no_truncate` bloqueia `TRUNCATE`; UPDATE/DELETE já eram bloqueados. |
| AX-024 | Corrigido | Bootstrap não imprime segredo TOTP; grava em arquivo `600` ou usa variável de ambiente. |
| AX-025 | Corrigido | Detalhe filtra `deletedAt`; filtro HTTP não devolve `exception.meta` em P2002. |
| AX-026 | Mitigado | Novos segredos e rotações exigem 16–60 caracteres; segredos legados de NAS permanecem até a janela de rotação. |
| AX-027 | Parcial | `mfaRequired`, `sessionTimeoutMinutes`, `passwordMinLength`, retenções e webhook passaram a ter efeito real. O motor de políticas (`policies`) continua declarativo. |
| AX-028 | Mitigado | Alertas de segurança no worker, webhook HTTPS opcional, SBOM CycloneDX e rotação de logs Docker. Falta integrar um SIEM externo. |

## Causas, risco e correção

### AX-018 — notificações sem permissão/escopo

- **Causa raiz:** o controller não tinha `@RequirePermissions`; qualquer sessão autenticada lia e alterava notificações globais.
- **Risco:** leitura de nomes de identidades e mensagens operacionais por perfis sem `users.read`; alteração indevida do estado de leitura.
- **Arquivos:** `apps/api/src/notifications/notifications.controller.ts`.
- **Correção:** `GET` exige `users.read`; `PATCH :id/read` exige `settings.write`.

### AX-020 — NAS curinga `0.0.0.0/0`

- **Causa raiz:** o site dinâmico procurava o IP exato e, se não encontrasse, usava o registro `0.0.0.0/0`.
- **Risco:** um único shared secret aceitava qualquer origem; vazamento afetava todos os NAS e permitia tentativa de autenticação de qualquer IP.
- **Arquivos:** `infra/freeradius/sites/dynamic-clients`, `infra/freeradius/entrypoint.sh`, `docker-compose.yml`, `apps/api/src/devices/devices.dto.ts`, `apps/api/src/devices/devices.service.ts`, `packages/contracts/src/index.ts`.
- **Correção:** fallback desabilitado por padrão (`RADIUS_ALLOW_WILDCARD_NAS=false`); o curinga só é usado se explicitamente habilitado. Os IPs reais observados no `radpostauth` foram migrados para `devices`/`nas` exatos, preservando os grupos autorizados e o shared secret legado para não interromper os NAS existentes. O registro `0.0.0.0/0` foi removido.
- **Teste real:** IP não cadastrado é descartado; IP cadastrado com segredo correto é processado.

### AX-021 — validade da identidade não checada pelo guard

- **Causa raiz:** `PermissionsGuard` carregava apenas `admins`, não a identidade `users` vinculada.
- **Risco:** um access token continuava aceito por até 15 minutos após expiração, bloqueio ou exclusão da identidade.
- **Arquivos:** `apps/api/src/common/permissions.guard.ts`.
- **Correção:** o guard inclui `user` e valida `status`, `deletedAt`, `validFrom` e `validUntil` em toda requisição autenticada.

### AX-022 — seed reativava `radius.test`

- **Causa raiz:** o seed criava `radius.test` com senha padrão e o `upsert` sobrescrevia status/credencial de contas existentes.
- **Risco:** conta conhecida podia voltar a autenticar após um seed.
- **Arquivos:** `apps/api/prisma/seed.ts`, migration `20261105140000_p2_security_hardening`.
- **Correção:** usuário removido do seed; `upsert` não altera status nem `radiusNtHash` de contas existentes; a migration bloqueia e remove credenciais de `radius.test` se ele existir.

### AX-023 — TRUNCATE contornava o append-only

- **Causa raiz:** o trigger existente cobria `UPDATE OR DELETE`, não `TRUNCATE`.
- **Risco:** apagar toda a trilha de auditoria em uma operação.
- **Arquivos:** migration `20261105140000_p2_security_hardening`.
- **Correção:** trigger `audit_events_no_truncate` `BEFORE TRUNCATE ... FOR EACH STATEMENT`.

### AX-024 — bootstrap imprimia TOTP

- **Causa raiz:** o script imprimia segredo, URI `otpauth` e código atual no stdout.
- **Risco:** segredo de MFA em logs/terminal/histórico.
- **Arquivos:** `apps/api/scripts/bootstrap-admin.ts`, `apps/api/src/common/bootstrap-message.ts`, `apps/api/test/bootstrap-message.test.ts`.
- **Correção:** segredo nunca é impresso. Quando gerado, é gravado em `BOOTSTRAP_TOTP_OUTPUT` (padrão `/tmp/axis-bootstrap-totp.txt`, modo `600`); quando fornecido por env, permanece apenas na env.

### AX-025 — detalhe expunha excluídos e P2002 vazava metadados

- **Causa raiz:** `users.detail` usava `findUnique` sem `deletedAt`; o filtro devolvia `exception.meta` no 409.
- **Risco:** enumeração de registros removidos e vazamento de nomes de colunas/índices/valores.
- **Arquivos:** `apps/api/src/users/users.service.ts`, `apps/api/src/common/http-exception.filter.ts`.
- **Correção:** detalhe usa `findFirst({ id, deletedAt: null })`; P2002 devolve apenas mensagem genérica.

### AX-026 — segredo de NAS curto

- **Causa raiz:** DTO aceitava 8 caracteres; o banco tinha default `'secret'`.
- **Risco:** segredo trivial/fraco e default previsível.
- **Arquivos:** `apps/api/src/devices/devices.dto.ts`, `packages/contracts/src/index.ts`, migration `20261105140000_p2_security_hardening`.
- **Correção:** novos segredos e rotações exigem 16–60 caracteres; default do banco removido. Segredos legados de NAS foram preservados para não quebrar equipamentos em produção; a rotação exige janela de manutenção.

### AX-027 — configurações/políticas decorativas

- **Causa raiz:** vários campos eram apenas persistidos e exibidos.
- **Risco:** falsa sensação de controle; `mfaRequired=false` podia reduzir proteção administrativa.
- **Arquivos:** `apps/api/src/auth/auth.service.ts`, `apps/api/src/users/users.service.ts`, `apps/worker/src/index.ts`.
- **Correção efetiva:**
  - identidades administrativas sempre exigem MFA, independentemente de `mfaRequired`;
  - `sessionTimeoutMinutes` limita o access token (teto de 15 minutos, mínimo de 5);
  - `passwordMinLength` é aplicado em criação, reset e troca de senha (piso de 14);
  - `auditRetentionDays`/`sessionRetentionDays` continuam aplicados no worker;
  - `notificationsWebhook`/`webhookUrl` são usados para alertas de segurança.
- **Pendente:** o motor de `policies` continua declarativo e não é avaliado pelo FreeRADIUS. A UI não deve ser tratada como enforcement até a P3.

### AX-028 — sem alerting/SIEM/SBOM/rotação de logs

- **Causa raiz:** ausência de monitoramento ativo e de inventário de dependências.
- **Risco:** ataque prolongado sem detecção; logs crescendo sem limite; dependências sem rastreabilidade.
- **Arquivos:** `apps/worker/src/index.ts`, `scripts/security/sbom.mjs`, `docker-compose.yml`, `package.json`.
- **Correção:**
  - worker cria notificações `security.alert` para bloqueios de conta, falhas repetidas de MFA e muitas rejeições RADIUS por NAS;
  - webhook HTTPS opcional com bloqueio de destinos locais/privados;
  - SBOM CycloneDX 1.5 via `pnpm security:sbom`;
  - rotação `json-file` de 10 MB × 3 em todos os containers.
- **Pendente:** integração com SIEM externo (Syslog/HTTP collector), retenção centralizada e alerta fora do painel.

## Evidências dos testes

Comando principal:

```bash
pnpm test:security:p2
```

Resultado final:

```text
PASS  AX-018/AX-020/AX-021/AX-025/AX-026/AX-027 web
PASS  AX-028 worker cria alerta de segurança
PASS  AX-020 RADIUS sem curinga
PASS  AX-020/AX-023/AX-025/AX-026 banco
PASS  AX-020/AX-024/AX-026/AX-028 hardening
PASS  AX-019 dependências e testes unitários
RESULT  P2 aprovado
```

Regressões:

```text
P0: AX-001, AX-007, AX-006, AX-002, accounting, AX-008, AX-003/AX-004 — aprovado
P1: AX-009/011/012/013/014/015/016 — aprovado
P1 DB: AX-010 — aprovado
TLS: AX-005 HSTS/CSP/cookies — aprovado
```

Evidências específicas:

- notificações: 401 sem sessão, 403 para self-service sem `users.read`;
- validade: token aceito antes, 401 depois de `validUntil` vencido, `deletedAt` preenchido ou `status=BLOCKED`;
- P2002: 409 sem `details` e sem `P2002`;
- NAS: curinga rejeitado pela API; `nas` sem `0.0.0.0/0`; 10 NAS exatos preservados; IP não cadastrado descartado;
- auditoria: `TRUNCATE` negado para `aaa_app` e para o owner; contagem intacta;
- bootstrap: teste unitário garante que a mensagem não contém segredo/URI;
- worker: alerta `Alerta: bloqueio de conta por tentativas` criado no banco;
- SBOM: 753 componentes CycloneDX;
- logs: `max-size=10m`, `max-file=3` em todos os serviços.

## Riscos de regressão e impactos operacionais

- **NAS:** o curinga foi removido. NAS novos precisam ser cadastrados com IP exato no painel. Os IPs observados foram migrados automaticamente, mas um equipamento que nunca autenticou e dependia do curinga precisará ser cadastrado.
- **Segredo legado:** os NAS migrados mantêm o shared secret anterior (9 caracteres) para não interromper a autenticação. A rotação para 16+ exige atualizar o segredo no equipamento e no painel na mesma janela.
- **Sessão:** `sessionTimeoutMinutes` agora encurta o access token, com teto de 15 minutos. O refresh token continua com `REFRESH_TTL_DAYS`.
- **Senhas:** o mínimo efetivo é `max(14, passwordMinLength)`. Aumentar o valor pode rejeitar senhas usadas por automações.
- **MFA:** `mfaRequired=false` não desabilita MFA de identidades administrativas.
- **Seed:** não cria mais `radius.test`; scripts de smoke agora exigem `RADIUS_TEST_USER` e `RADIUS_TEST_PASSWORD`.
- **RADIUS local:** `RADIUS_CLIENT_SECRET` foi rotacionado; ferramentas que usavam `testing123` deixam de autenticar.
- **Logs:** a rotação é local por container; para retenção legal/SIEM é necessário collector externo.

## Rollback

- Banco pré-P2: `backups/aaa_manager-20261105T135220Z.sql`.
- Código/config pré-P2: `/tmp/opencode/aaa-manager-pre-p2.tar.gz` (modo 600).
- Migration P2: aplicar o dump acima ou remover manualmente:
  ```sql
  DROP TRIGGER IF EXISTS audit_events_no_truncate ON audit_events;
  DROP FUNCTION IF EXISTS prevent_audit_truncate();
  ```
- Para reabilitar o comportamento de curinga (não recomendado):
  ```text
  RADIUS_ALLOW_WILDCARD_NAS=true
  ```
  e recriar um NAS `0.0.0.0/0` no painel. O código volta a aceitar o curinga, mas o shared secret deve ter 16+ caracteres.
- Para reverter a rotação do segredo do cliente radtest, restaure `RADIUS_CLIENT_SECRET` do `.env` pré-P2 e recrie o container do FreeRADIUS.
