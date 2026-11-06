# Limitações conhecidas

## Escopo

- **VPN foi removida do produto.** Não há páginas, rotas, tabelas, permissões, tipos ou integração de VPN.
- O aplicativo Flutter ainda não foi implementado.
- Não há suporte multi-tenant.
- Não há alta disponibilidade, replicação de PostgreSQL ou cluster RADIUS.

## RADIUS

- Autenticação real apenas com MS-CHAPv2 e NT-Password.
- PAP está desabilitado. Equipamentos que só suportam PAP não autenticam.
- EAP-TLS/TTLS não está configurado; não há PKI de cliente.
- CoA/Disconnect usa Disconnect-Request RFC 5176 na porta UDP 3799. O NAS precisa aceitar CoA e permitir o IP de origem; se não suportar ou não responder, o painel encerra apenas o accounting e a sessão pode continuar ativa no equipamento.
- O Disconnect-Request usa o shared secret do NAS. Não há suporte a POD nem a CoA autenticado por IPsec; para redes não confiáveis, restrinja a porta 3799 por firewall.
- Autorização é aplicada por grupo e por equipamento. As condições arbitrárias das políticas ainda não são traduzidas para o FreeRADIUS.
- Atributos de resposta vêm apenas dos grupos, não do NAS. Uma identidade em vários grupos recebe a união dos atributos.
- Atributos VSA são livres e não validados contra o dicionário de cada firmware.
- O FreeRADIUS aceita pacotes direcionados ao cliente dinâmico, mas só processa IPs cadastrados na tabela `nas`. Cadastro é imediato; rotação de segredo e exclusão valem em até 60 segundos. Restrinja UDP 1812/1813 na borda às redes de gerência.
- O modo curinga (`0.0.0.0/0`) está desabilitado por padrão e foi removido deste ambiente. Para transição, ele pode ser reabilitado com `RADIUS_ALLOW_WILDCARD_NAS=true`, mas compartilha um único shared secret entre todos os equipamentos não cadastrados.
- Segredos legados de NAS podem ter menos de 16 caracteres até a janela de rotação; novos segredos e rotações exigem 16–60.
- A saúde do FreeRADIUS é inferida pela última atividade no banco, não por um probe RADIUS.
- Não há IP pool, simultaneous-use ou controle de banda além dos atributos de grupo.
- O hash NT é suscetível a ataque offline se o banco vazar.

## Segurança e operação

- O compose de desenvolvimento usa HTTP na porta 8080. TLS, HSTS e `COOKIE_SECURE=true` são obrigatórios em produção.
- Não há CSP no Nginx.
- O mesmo usuário do PostgreSQL atende API e FreeRADIUS. Roles separadas são recomendadas.
- Segredos de NAS precisam existir em claro na tabela `nas`; o banco deve ser interno.
- Segredos ficam em `.env` no compose, sem secret manager.
- Rate limiting cobre login e MFA; não há limite por conta além do IP.
- Não há WAF.
- A purga automática de auditoria não é executada por causa do trigger append-only.
- Notificações são apenas internas no banco; e-mail e webhook não são entregues.
- Não há CI, testes multi-browser ou testes de carga.
- O backup foi testado restaurando em banco temporário, mas não há agendamento embutido.

## Interface

- A edição de grupos e da matriz de permissões é somente leitura. O backend expõe leitura de grupos; a edição fica para a próxima fase.
- O editor de políticas cria a regra com condições vazias; não há construtor visual de condições.
- Não há tela de notificações nem editor de perfil do administrador.
- O dashboard atualiza por polling a cada 30 segundos, sem WebSocket.
- A sessão administrativa não tem tela de troca de senha; o foco está na credencial de rede.
- O tema é escuro único, justificado em `docs/DESIGN.md`.

## Dados

- Sessões de login administrativo podem não receber `Framed-IP-Address`. O schema aceita esse campo nulo e a sessão aparece mesmo sem IP atribuído.

- O seed cria identidades de demonstração sem credencial RADIUS. Crie a senha no painel; não existe mais usuário de teste com senha padrão.
- Eventos de autenticação e sessões só aparecem após tráfego RADIUS real.
- Autenticação atualiza a presença do equipamento, mas sessões só existem com accounting. Equipamentos sem nenhuma atividade mantêm o status do seed.
- Datas e fusos são exibidos em `pt-BR`, com armazenamento em UTC.
