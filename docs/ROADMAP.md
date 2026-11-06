# Roadmap

Estado real, sem marcar como concluído o que não foi executado.

## Fase 0: arquitetura

- [x] Monorepo com API, worker, web e contratos
- [x] Modelo de dados e migrations Prisma
- [x] Schema SQL do FreeRADIUS
- [x] Direção visual e sistema de tokens

## Fase 1: frontend

- [x] Login com TOTP, sessão em cookie e CSRF
- [x] Dashboard com métricas reais, gráfico e saúde
- [x] CRUD de identidades, bloqueio, revogação, reset de credencial e CSV
- [x] Grupos e matriz de permissões
- [x] Políticas
- [x] Equipamentos, segredo de NAS e perfis por fabricante
- [x] Sessões e auditoria
- [x] Configurações e notificações internas
- [x] Remoção completa de VPN
- [x] Responsividade desktop, tablet e mobile
- [x] Testes Playwright dos fluxos principais

## Fase 2: backend

- [x] NestJS com módulos Auth, Users, Groups, Policies, Devices, Radius, Sessions, Audit, Notifications, Settings e Health
- [x] Prisma + PostgreSQL e migrations
- [x] Argon2id, TOTP, JWT de 15 minutos
- [x] Refresh token com rotação, revogação e detecção de reuso
- [x] RBAC no backend por permissões
- [x] Rate limiting com Redis
- [x] CSRF double-submit
- [x] Swagger
- [x] Auditoria append-only com trigger
- [x] Login no painel com credencial RADIUS e TOTP opcional
- [x] Portal de autoatendimento para perfil e sessões próprias
- [x] Autenticações e sessões RADIUS na auditoria
- [x] Worker BullMQ com heartbeat, presença, limpeza e notificações
- [x] Exclusão lógica
- [x] Bootstrap seguro do primeiro administrador
- [ ] Edição de grupos e permissões pela API
- [ ] CI com testes automatizados
- [ ] Métricas Prometheus e tracing

## Fase 3: RADIUS

- [x] FreeRADIUS 3.2.3 em container
- [x] rlm_sql_postgresql com schema oficial
- [x] MS-CHAPv2 com NT-Password
- [x] Autorização por grupo e por equipamento
- [x] Bloqueio e expiração por `Auth-Type := Reject`
- [x] NAS clients na tabela `nas`
- [x] Resolução dinâmica de clientes sem restart
- [x] NAS por IP exato; modo curinga `0.0.0.0/0` apenas opt-in para transição
- [x] Atributos de resposta por grupo
- [x] Edição de atributos de grupo no painel
- [x] Sugestões de atributos RADIUS comuns e VSAs
- [x] Accounting Start, Interim e Stop
- [x] `radpostauth` sem senha
- [x] Testes reais com `radtest` e `radclient`
- [x] Script de smoke RADIUS
- [ ] CoA/Disconnect
- [ ] EAP-TLS/TTLS
- [ ] PAP legado
- [ ] RadSec

## Fase 4: infraestrutura

- [x] Docker Compose com 7 serviços
- [x] PostgreSQL e Redis sem portas públicas
- [x] Redes pública e interna
- [x] Migrations automáticas no start da API
- [x] Nginx como proxy
- [x] Containers da API, worker e web sem root
- [x] Backup e restauração testados
- [x] Documentação operacional
- [ ] TLS no compose
- [ ] Secret manager
- [ ] Roles separadas no PostgreSQL
- [ ] Hardening e limites de recurso

## Fase 5: mobile

- [ ] Cliente Flutter gerado a partir do OpenAPI
- [ ] Armazenamento seguro de tokens
- [ ] MFA e biometria
- [ ] Sessões e auditoria em leitura
- [ ] Distribuição Android e iOS

## Critérios de aceite

| # | Critério | Estado |
| --- | --- | --- |
| 1 | Containers iniciam | Concluído: 7 serviços saudáveis |
| 2 | Migrations sem erro | Concluído em banco limpo |
| 3 | Administrador inicial autentica | Concluído com bootstrap e TOTP |
| 4 | RBAC respeitado no backend | Concluído com guard de permissões |
| 5 | Usuários criados, editados e bloqueados | Concluído com persistência |
| 6 | RADIUS aceita válido e rejeita inválido | Concluído com `radtest` |
| 7 | Accounting registrado | Concluído com Start, Interim e Stop |
| 8 | Equipamentos associados a políticas | Parcial: grupos e atributos RADIUS aplicados; condições de política ainda não |
| 9 | VPN | Removida do escopo |
| 10 | Logs e auditoria consultáveis | Concluído |
| 11 | Testes automatizados passam | Parcial: 15 unitários e 5 e2e, sem CI |
| 12 | Ambiente recriado pela documentação | Concluído |

## Próximos passos de maior impacto

1. CoA/Disconnect e validação no NAS.
2. TLS e secret manager.
3. PAP/EAP conforme o parque de equipamentos.
4. Motor de políticas aplicado ao RADIUS.
5. Edição de grupos na interface e API.
6. CI com testes de integração e RADIUS.
