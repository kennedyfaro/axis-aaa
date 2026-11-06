# API

Base: `/api/v1`. OpenAPI/Swagger em `/api/docs`.

A API é implementada em NestJS com validação por DTOs, resposta de erro centralizada e RBAC por permissão. O frontend consome a API pelo proxy do Next (mesma origem). O Swagger é a referência gerada em tempo de execução.

## Autenticação

Fluxo:

1. `POST /auth/login` com e-mail ou login RADIUS e senha.
2. Se MFA estiver habilitado, a resposta retorna `challengeId` e nenhum cookie de sessão. Identidades RADIUS em grupos com permissões usam a mesma senha do RADIUS; sem MFA, a sessão é emitida direto.
3. `POST /auth/mfa` com `challengeId` e TOTP de 6 dígitos.
4. A API grava três cookies:
   - `aaa_access`: JWT de 15 minutos, `httpOnly`.
   - `aaa_refresh`: token opaco de 7 dias, `httpOnly`, `path=/api/v1/auth`.
   - `aaa_csrf`: token de double-submit, legível pelo JavaScript.
5. Toda mutação autenticada exige o header `X-CSRF-Token` igual ao cookie `aaa_csrf`.

| Método | Rota | Autenticação | Descrição |
| --- | --- | --- | --- |
| POST | `/auth/login` | pública | Primeiro fator |
| POST | `/auth/mfa` | pública | TOTP e emissão dos cookies |
| POST | `/auth/refresh` | refresh cookie | Rotação do refresh token |
| POST | `/auth/logout` | pública | Revoga o refresh atual e limpa cookies |
| GET | `/auth/me` | access cookie | Sessão e permissões efetivas |

O refresh token é armazenado como hash SHA-256. Reuso de um token já revogado revoga toda a família daquele administrador.

## Permissões

| Permissão | Operação |
| --- | --- |
| `users.read` | Listar e consultar identidades |
| `users.write` | Criar, editar, excluir e redefinir credencial |
| `users.block` | Bloquear e desbloquear |
| `users.export` | Exportar CSV |
| `groups.read` | Listar grupos |
| `groups.write` | Editar grupos e permissões |
| `policies.read` / `policies.write` | Consultar e alterar políticas |
| `devices.read` / `devices.write` | Consultar e cadastrar NAS, rotacionar segredo |
| `pools.read` / `pools.write` | Consultar pools e vincular/liberar IPs fixos de VPN |
| `sessions.read` / `sessions.revoke` | Consultar e encerrar accounting |
| `audit.read` / `audit.export` | Consultar e exportar trilha |
| `settings.read` / `settings.write` | Consultar e alterar configurações |

## Endpoints

### Identidades

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/users?query=&status=&group=&page=&pageSize=` | Lista paginada |
| POST | `/users` | Cria identidade com senha RADIUS obrigatória |
| GET | `/users/:id` | Ficha, grupos, sessões e auditoria |
| PATCH | `/users/:id` | Atualiza nome, e-mail, grupos, validade, MFA e observações |
| DELETE | `/users/:id` | Exclusão lógica e remoção das credenciais RADIUS |
| POST | `/users/:id/block` | Bloqueia, remove credencial e encerra accounting |
| POST | `/users/:id/unblock` | Reativa a credencial se a validade permitir |
| POST | `/users/:id/revoke-sessions` | Envia Disconnect-Request (CoA) para as sessões ativas e encerra o accounting |
| POST | `/users/:id/reset-password` | Substitui o NT-Password; também altera a senha do painel da identidade |
| POST | `/users/:id/totp` | Gera ou aceita `secret` Base32 manual e habilita MFA para a conta de painel da identidade |

### Autoatendimento

Disponível para identidades RADIUS nos grupos **Acesso Full** e **Acesso de Visualização**. O vínculo é feito pelo `admin.userId`; o cliente não informa o ID da identidade.

| Método | Rota | Permissão | Descrição |
| --- | --- | --- | --- |
| GET | `/me` | `self.profile.read` | Perfil, grupos e sessões da própria identidade |
| PATCH | `/me` | `self.profile.write` | Nome, e-mail e observações próprios; não altera grupos, validade ou atributos |
| GET | `/me/sessions` | `self.sessions.read` | Sessões da própria identidade |
| POST | `/me/sessions/:id/revoke` | `self.sessions.revoke` | Encerra apenas uma sessão própria |
| POST | `/me/password` | `self.profile.write` | Troca a própria senha RADIUS; exige a senha atual |
| POST | `/me/totp` | `self.profile.write` | Gera ou aceita segredo TOTP da própria conta |

### Grupos e políticas

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/groups` | Grupos, permissões, contagem e atributos RADIUS |
| PATCH | `/groups/:id` | Substitui os atributos RADIUS do grupo e sincroniza `radgroupreply` |
| GET | `/policies` | Políticas por prioridade |
| POST | `/policies` | Cria política |
| POST | `/policies/:id/toggle` | Ativa ou desativa |

### Equipamentos

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/devices` | Inventário NAS |
| POST | `/devices` | Cadastra NAS; gera ou aceita `secret` e retorna o valor uma única vez |
| PATCH | `/devices/:id` | Atualiza grupos autorizados no NAS |
| DELETE | `/devices/:id` | Remove o inventário e o cliente da tabela `nas` |
| POST | `/devices/:id/rotate-secret` | Gera ou informa novo segredo e retorna uma única vez |

O segredo é cifrado com AES-256-GCM no banco da aplicação e materializado na tabela `nas` para o FreeRADIUS. Clientes e grupos são consultados em tempo real e não exigem restart. Atributos de resposta pertencem aos grupos, não aos equipamentos. Cadastro é imediato; rotação de segredo e exclusão valem em até 60 segundos.

O campo `ip` aceita um IPv4 exato. O valor `0.0.0.0/0` é rejeitado por padrão; ele só é aceito se `RADIUS_ALLOW_WILDCARD_NAS=true`, e mesmo assim deve ser usado apenas como transição.

No cadastro e na rotação, o campo opcional `secret` aceita de 16 a 60 caracteres imprimíveis, sem espaço no início ou no fim. Se for omitido, o painel gera um segredo aleatório. O valor é retornado uma única vez na resposta. Segredos legados de NAS podem permanecer até a janela de rotação.

### Pools de IP

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/ip-pools` | Pools com total, usados e livres |
| POST | `/ip-pools` | Cria pool com `name`, `description`, `startIp` e `endIp` |
| DELETE | `/ip-pools/:id` | Exclui pool sem endereços vinculados |
| GET | `/ip-pools/:id/addresses` | Endereços do pool e identidade vinculada |
| GET | `/ip-pools/eligible-users` | Identidades VPN ativas e sem IP fixo |
| POST | `/ip-pools/:id/assign` | Vincula `{ userId, address? }`; sem `address`, usa o primeiro livre |
| DELETE | `/ip-pools/:id/assignments/:userId` | Libera o IP da identidade |

Um IP só pode pertencer a uma identidade, a faixa não pode se sobrepor a outro pool e o vínculo exige identidade ativa em grupo de VPN. O valor é publicado em `radreply` como `Framed-IP-Address` e removido quando a identidade sai do grupo de VPN, é excluída ou o endereço é liberado.

### Sessões e dashboard

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/sessions?status=active\|closed\|all&query=` | Sessões do `radacct`, com `nasIdentifier` vindo do NAS-Identifier |
| POST | `/sessions/:id/revoke` | Envia Disconnect-Request (CoA), encerra o accounting e retorna `disconnected` e `coaStatus` |
| GET | `/dashboard/summary` | Indicadores agregados |
| GET | `/dashboard/auth-series?range=24h\|7d\|30d` | Série de `radpostauth` |

### Auditoria, configurações e saúde

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/audit?query=&result=&period=24h\|7d\|30d` | Eventos administrativos e RADIUS (`radius.*`) |
| GET | `/export/audit` | CSV de auditoria, com evento de exportação |
| GET | `/export/users` | CSV de identidades |
| GET | `/settings` | Configurações |
| PATCH | `/settings` | Atualiza configurações |
| GET | `/notifications` | Notificações internas |
| PATCH | `/notifications/:id/read` | Marca como lida |
| GET | `/health` | Sondas públicas de API, banco, Redis, RADIUS e worker |

## Erros

```json
{
  "message": "Revise os dados enviados.",
  "details": ["Informe um nome completo."]
}
```

Códigos: `400`, `401`, `403`, `404`, `409`, `422`, `429`, `500`.

## Integração com o frontend

O Next faz proxy de `/api/v1/*` para `API_INTERNAL_URL` e preserva os cookies. O cliente HTTP renova a sessão automaticamente em `401` e envia o token CSRF nas mutações. O futuro app Flutter pode usar a API diretamente, desde que preserve o contrato de cookies ou use Bearer token no header `Authorization`.
