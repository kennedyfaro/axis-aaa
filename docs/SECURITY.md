# Segurança

## Controles implementados

- Argon2id para senhas administrativas.
- TOTP obrigatório para administradores, com janela de tolerância de 30 segundos.
- Access token JWT de 15 minutos em cookie `httpOnly`.
- Refresh token opaco de 7 dias, armazenado apenas como hash SHA-256, com rotação e revogação de toda a família em caso de reuso.
- CSRF double-submit em todas as mutações autenticadas por cookie.
- RBAC no backend por permissões de grupo, verificado em cada rota.
- Rate limiting com Redis para login e MFA.
- Validação de entrada com class-validator e whitelist de campos.
- Helmet, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` e `Permissions-Policy`.
- Cookies `SameSite=Lax`, `Secure` quando `COOKIE_SECURE=true`.
- Auditoria append-only no PostgreSQL, com trigger que bloqueia UPDATE e DELETE.
- Shared secrets de NAS cifrados com AES-256-GCM no banco da aplicação e retornados uma única vez.
- IP fixo de VPN só é vinculado a identidade ativa em grupo de VPN, exige endereço livre e tem unicidade garantida por índice no banco. Vínculo, liberação e troca de grupo são auditados.
- Grupos de VPN autorizam apenas sessões PPP. Login de gerência exige um grupo não-VPN autorizado no NAS, verificado por `Service-Type`, `Framed-Protocol` e `NAS-Port-Type`.
- CoA/Disconnect usa o shared secret do NAS em UDP 3799. Restrinja a porta ao IP do servidor e monitore `NAK`, `timeout` e falhas de autenticador.
- Credenciais RADIUS armazenadas como NT-Password, nunca em texto puro na trilha ou na API.
- `radpostauth` grava a senha como string vazia.
- API, worker e web executam com usuário sem privilégio de root.
- PostgreSQL e Redis não publicam portas e ficam na rede Docker interna.
- API acessa banco e Redis apenas pela rede interna; Nginx e web ficam na rede pública.
- Swagger e health não expõem segredos.
- Backup e restauração documentados e testados.

## RADIUS e transporte

RADIUS tradicional usa UDP e não oferece confidencialidade fim a fim. O shared secret protege a integridade do intercâmbio e a autenticação do cliente, não os atributos.

Recomendações obrigatórias em produção:

- Isolar 1812/1813 em rede de gerência ou túnel de transporte.
- Preferir RadSec (RADIUS sobre TLS) nos equipamentos que suportarem.
- Segredo único por NAS, com rotação e cofre de segredos.
- Bloquear PAP fora da rede de gerência.
- Restringir os clientes RADIUS por IP/identificador.
- Monitorar falhas sem registrar senhas ou atributos sensíveis.

## Login do painel com identidade RADIUS

Uma identidade RADIUS que pertence a um grupo com permissões de painel (por exemplo, Administradores ou Auditoria) ganha uma conta de administrador vinculada. O login aceita o login ou o e-mail da identidade e valida a senha contra o NT-Password usado no RADIUS.

- A mesma senha vale para equipamentos e painel. Redefinir a credencial RADIUS altera as duas.
- Bloquear, remover ou tirar a identidade dos grupos de painel desativa a conta e revoga os refresh tokens.
- O MFA é opcional para essas contas. Ao marcar **Exigir MFA** ou usar **Configurar 2FA**, o próximo login exige o código TOTP no mesmo campo das contas administrativas nativas. O segredo pode ser gerado pelo painel ou informado manualmente em Base32; ele é exibido uma única vez.
- Contas administrativas nativas continuam obrigatoriamente com Argon2id e MFA.
- O NT-Password é um hash rápido. Se o banco vazar, a senha pode ser atacada offline; isso também compromete o painel. Use senhas longas e MFA.

## Autoatendimento das identidades RADIUS

As identidades dos grupos **Acesso Full** e **Acesso de Visualização** têm um portal restrito ao próprio escopo:

- Consultam e editam apenas nome, e-mail e observações.
- Consultam e encerram apenas as próprias sessões RADIUS.
- Podem trocar a própria senha RADIUS, sempre validando a senha atual.
- Não alteram grupos, validade, status, credenciais de terceiros ou atributos RADIUS.
- O vínculo vem de `admins.userId`; a API não aceita um ID de usuário enviado pelo cliente.
- Os endpoints globais (dashboard, usuários, grupos, equipamentos, auditoria, configurações) exigem permissões globais que esses grupos não possuem.
- O login e o refresh verificam se a identidade vinculada continua ativa.

## Credenciais

O login do painel aceita senhas a partir de 6 caracteres para manter compatibilidade com credenciais legadas importadas do daloRADIUS. Novas credenciais e redefinições continuam exigindo 14 ou mais caracteres. Recomenda-se rotacionar as senhas importadas.

O método habilitado é MS-CHAPv2 com NT-Password. O hash NT é rápido e suscetível a ataque de dicionário offline se o banco vazar. Mitigações:

- Senhas longas e aleatórias por identidade.
- Banco sem exposição pública.
- Rotação após desligamento.
- Princípio do menor privilégio nos grupos.
- Bloqueio e expiração sincronizados para o RADIUS.

EAP-TLS/TTLS e PAP não estão habilitados. EAP exigiria PKI e configuração adicional; PAP exigiria credencial reversível.

## Segredos de NAS

O FreeRADIUS precisa do shared secret em claro na tabela `nas`. O valor é cifrado na tabela `devices` e materializado em `nas` apenas para o servidor RADIUS. Consequências:

- O banco deve ser interno e com acesso restrito.
- Um vazamento do banco expõe os segredos de NAS.
- Em produção, use um cofre de segredos e um processo de injeção no FreeRADIUS.
- Após rotação, atualize o equipamento e aguarde até 60 segundos pelo cache de clientes dinâmicos do FreeRADIUS.
- O servidor aceita pacotes de qualquer origem e consulta o banco. Restrinja UDP 1812/1813 na borda às redes de gerência dos NAS para reduzir superfície de DoS.
- O modo curinga (`0.0.0.0/0`) é desabilitado por padrão. Cada NAS deve ser cadastrado por IP exato; o modo curinga só deve ser reabilitado conscientemente (`RADIUS_ALLOW_WILDCARD_NAS=true`) para uma transição.
- Segredos novos ou rotacionados exigem 16 a 60 caracteres. Segredos legados podem permanecer até a janela de rotação.

## Lacunas conhecidas

| Lacuna | Impacto | Próximo passo |
| --- | --- | --- |
| Sem CoA/Disconnect | Encerrar no painel não derruba a sessão no NAS | Implementar RFC 5176 com radclient/CoA |
| Sem EAP-TLS/TTLS | Não há autenticação por certificado de cliente | PKI e módulo EAP |
| Sem PAP | Equipamentos legados que só usam PAP não autenticam | Avaliar credencial reversível e risco |
| Políticas arbitrárias não avaliadas | Condições não são aplicadas pelo FreeRADIUS | Motor de políticas ou atributos de grupo |
| Sem TLS no compose | Tráfego administrativo em HTTP no ambiente local | TLS no Nginx, HSTS e `COOKIE_SECURE=true` |
| Sem CSP no Nginx | Superfície de XSS maior | Publicar CSP compatível com o build |
| Sem WAF | Sem proteção de borda | Adicionar proxy/WAF |
| Sem CI | Regressões dependem de execução local | Pipeline com testes, build e RADIUS smoke |
| Sem purga de auditoria | Trilha cresce indefinidamente | Arquivamento externo com prova de integridade |
| Mesmo usuário de banco para API e RADIUS | Privilégios amplos para o FreeRADIUS | Criar roles separadas e grants mínimos |
| Sem secret manager | Segredos em `.env` no compose | Vault/SOPS/Secrets Manager |
| Sem limite de tentativas por conta além de IP | Ataque distribuído possível | Limite por conta e reputação |

## Auditoria

- Eventos administrativos ficam em `audit_events`.
- Trigger impede alteração e exclusão pela aplicação.
- Exportação de auditoria gera um novo evento.
- Autenticações RADIUS (`radius.auth.accept`/`reject`) e sessões (`radius.session.start`/`stop`) entram em `audit_events` por triggers no PostgreSQL, com ator, NAS, IP, resultado e metadados. As senhas nunca são registradas.
- Retenção configurável é exibida, mas a purga automática da auditoria não é feita para preservar a trilha.

## Bootstrap

- Não existe senha padrão.
- O comando exige senha de no mínimo 14 caracteres, recusa valores fracos e não recria administrador se já existir.
- O segredo TOTP é exibido uma única vez.
- Em produção, execute o bootstrap com variáveis injetadas por secret manager, não em histórico de shell.

## Reportar incidente

1. Revogue refresh tokens do administrador afetado.
2. Bloqueie a identidade ou administrador.
3. Rotacione segredos de NAS e reinicie o FreeRADIUS.
4. Preserve os eventos de auditoria e `radpostauth`.
5. Restaure de backup confiável se houver alteração indevida.
