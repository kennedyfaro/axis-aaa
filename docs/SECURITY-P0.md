# Remediação de segurança — fase P0

Data: 05/11/2026

Escopo: AX-001, AX-002, AX-003, AX-004, AX-005, AX-006, AX-007 e AX-008.
Nenhuma migration foi adicionada ou alterada.

## Correções

| ID | Correção |
| --- | --- |
| AX-001 | `users.write` só concede grupos cujas permissões administrativas o ator já possui; autoalteração de grupos/status bloqueada; gestão de identidade exige que o alvo não tenha permissões maiores. |
| AX-002 | `auto_escape = yes`, uso de `%{SQL-User-Name}`, remoção da interpolação de `NAS-Identifier` e validação de vigência na consulta `authorize_check_query`. |
| AX-003 | `.env` em modo `600`; bootstrap secrets não são mais necessários em runtime; rotação de credenciais históricas pendente. |
| AX-004 | `backups/` excluído do `.dockerignore`; dumps em modo `600`; diretório `700`; backup novo criado com `umask 077`. |
| AX-005 | `docker-compose.prod.yml` com TLS, HSTS, redirect 80→443 e `COOKIE_SECURE=true`; nginx TLS em `infra/nginx/nginx.tls.conf`. |
| AX-006 | `Expiration` gravado no `radcheck`; consulta SQL valida `validFrom`, `validUntil`, `status` e `deletedAt` em tempo real. |
| AX-007 | `mfaRequired` aplicado a contas com permissões administrativas; enrollment TOTP no primeiro login; auto-serviço permanece sem MFA forçado. |
| AX-008 | FreeRADIUS 3.2.8 com `RADIUS_REQUIRE_MA` configurável. Em 05/11/2026 foi definido `false` para compatibilidade com o Nokia SR1/BNG; `true` continua disponível e recomendado quando todos os NAS suportarem MA. |

## Evidências executadas

- `pnpm typecheck`: aprovado.
- `pnpm test`: 21 testes da API e 12 do web aprovados.
- `pnpm test:security:p0`: AX-001, AX-002, AX-003/AX-004, AX-006, AX-007, AX-008 e accounting aprovados.
- `pnpm test:security:tls`: HTTPS, HSTS, redirect e cookies `Secure`/`HttpOnly` aprovados.
- RADIUS real: Access-Accept/Reject, Start/Interim/Stop e expiração por `validUntil`/`validFrom`.
- Blast-RADIUS: teste adaptativo. Com `RADIUS_REQUIRE_MA=true`, pacote sem MA é descartado; com `false` (ambiente atual), o teste registra explicitamente que a mitigação está desativada.
- Injeção SQL: `User-Name` malicioso rejeitado e `NAS-Identifier` malicioso não persistido nem usado em SQL.

## Pendências que exigem janela e autorização

- Rotacionar `JWT_ACCESS_SECRET`, `ENCRYPTION_KEY`, senha do PostgreSQL, senha/TOTP do administrador `Debug`, shared secrets dos NAS e senhas RADIUS. Esses valores estiveram legíveis em `.env` e em backups antigos.
- Remover imagens Docker antigas que ainda contenham dumps de backup.
- Executar os testes P0 em ambiente de staging com um NAS real antes da produção.
- Itens P1/P2 do relatório de auditoria não foram iniciados.
