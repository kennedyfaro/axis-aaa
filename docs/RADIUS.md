# RADIUS

O FreeRADIUS 3.2.8 processa autenticação e accounting usando o schema SQL oficial (`radcheck`, `radreply`, `radgroupcheck`, `radgroupreply`, `radusergroup`, `radacct`, `radpostauth`, `nas`).

## Fluxo de autenticação

```text
NAS / radtest
   │  Access-Request (MS-CHAPv2)
   ▼
FreeRADIUS 3.2.8
   │  authorize: mschap, sql, files, expiration
   │  radcheck: NT-Password
   │  radusergroup: grupo RADIUS
   │  radgroupreply: Session-Timeout, Idle-Timeout, Interim-Interval
   ▼
Access-Accept / Access-Reject
   │
   ├── radpostauth (sem senha)
   └── radacct (Start, Interim, Stop)
```

## Credenciais

A API não armazena a senha da identidade. Ela calcula o **NT-Password**, que é o hash MD4 da senha em UTF-16LE, e grava esse hash em `users."radiusNtHash"` e em `radcheck` com o atributo `NT-Password`.

- Método principal: MS-CHAPv2 com NT-Password.
- PAP também aceita NT-Password no schema atual; evite PAP em redes não confiáveis.
- EAP-TLS/TTLS não está configurado. Para EAP seria necessária uma PKI própria e configuração do módulo `eap`.
- O hash NT permite ataques de dicionário offline. Use senhas longas, limite tentativas e proteja o banco.
- O atributo `Expiration` é gravado no `radcheck` e a consulta de autorização também valida `validFrom`/`validUntil`, bloqueando contas expiradas sem depender de restart.

O teste real usa:

```bash
docker compose exec freeradius \
  radtest -t mschap "$RADIUS_TEST_USER" "$RADIUS_TEST_PASSWORD" 127.0.0.1 0 "$RADIUS_CLIENT_SECRET"
```

Crie a identidade de teste no painel. O seed não cria mais `radius.test` nem senha padrão.

## Endurecimento SQL e Blast-RADIUS

- `auto_escape = yes` e `%{SQL-User-Name}` são usados nas consultas SQL.
- O `NAS-Identifier` não é interpolado no `post-auth`; o nome vem da tabela `nas` pelo IP de origem.
- O `Message-Authenticator` é controlado por `RADIUS_REQUIRE_MA` (`true` por padrão). Com `true`, clientes dinâmicos exigem MA e mitigam Blast-RADIUS (CVE-2024-3596); com `false`, NAS antigos continuam compatíveis, mas a mitigação fica desativada para eles.
- No ambiente atual, `RADIUS_REQUIRE_MA=false` por compatibilidade com o Nokia SR1/BNG. Se um pacote trouxer MA, o FreeRADIUS 3.2.8 ainda valida o conteúdo e descarta MA inválido.
- Recomenda-se reativar `RADIUS_REQUIRE_MA=true` assim que todos os NAS suportarem MA e restringir UDP 1812/1813 por firewall aos IPs dos NAS confiáveis.

## Autorização por grupo

Cada grupo possui `radiusGroupName` e `radiusAttributes`:

| Grupo | Groupname | Atributos |
| --- | --- | --- |
| Acesso Full | `acesso-full` | Mikrotik-Group full, Cisco-AVPair shell:priv-lvl=15, Huawei-Exec-Privilege 15 |
| Prestadores | `prestadores` | Session-Timeout 14400, Idle-Timeout 900 |
| Acesso de Visualização | `acesso-visualizacao` | Mikrotik-Group read, Cisco-AVPair shell:priv-lvl=1, Huawei-Exec-Privilege 1, Session-Timeout 28800, Idle-Timeout 1800 |
| VPN PPTP | `vpn-pptp` | Framed-Protocol PPP, Acct-Interim-Interval 300 |
| VPN L2TP | `vpn-l2tp` | Framed-Protocol PPP, Acct-Interim-Interval 300 |

Identidades em mais de um grupo recebem os atributos de **todos** os grupos. Exemplo: `kennedy.matos` em **Acesso Full + VPN PPTP + VPN L2TP** recebe os atributos de gerência e também `Framed-Protocol=PPP` para os túneis. Quando o mesmo atributo existe em mais de um grupo, ele aparece uma única vez, vencendo o grupo de menor prioridade. O pool de IPs, MPPE e DNS continuam no profile PPP do equipamento.

Um endereço fixo de VPN é gravado por identidade em `radreply` como `Framed-IP-Address`. Ele só é aceito para identidades ativas em grupos de VPN, usa um IP livre de um pool e é removido quando a identidade sai do grupo, é excluída ou o endereço é liberado no painel.

Esses valores são sincronizados em `radgroupreply`; a associação da identidade fica em `radusergroup`.

## Login de gerência e VPN

A autorização por equipamento distingue o tipo de sessão:

- Sessões PPP (PPTP/L2TP), identificadas por `Service-Type=Framed-User`, `Framed-Protocol=PPP` ou `NAS-Port-Type=Virtual`, aceitam grupos VPN e grupos de acesso ao equipamento.
- Logins de gerência (WinBox, SSH, console), com `Service-Type=Login-User` ou sem atributos PPP, exigem pelo menos um grupo não-VPN autorizado no NAS, como Acesso Full, Acesso de Visualização ou Prestadores.

Um usuário apenas em **VPN PPTP** ou **VPN L2TP** consegue estabelecer o túnel, mas recebe Access-Reject ao tentar entrar no equipamento. O mesmo usuário pode acumular Acesso Full e VPN: o login de gerência é autorizado pelo grupo de acesso e o túnel pelos grupos VPN.

Um NAS separado com secret próprio só separa os serviços se o túnel for terminado em outro IP ou equipamento. No mesmo MikroTik, login e PPP usam o mesmo IP de origem e o mesmo shared secret; criar outro NAS com o mesmo IP não diferencia o serviço.

Na auditoria, o accounting com `Framed-Protocol=PPP`, `Service-Type=Framed-User` ou `NAS-Port-Type=Virtual` aparece como **Sessão VPN iniciada** ou **Sessão VPN encerrada**, com os metadados do tipo de serviço. Sessões de gerência continuam como **Sessão RADIUS iniciada** ou **encerrada**. O evento só existe se o NAS enviar accounting PPP.

O FreeRADIUS grava `AcctStartTime` e `AcctStopTime` com o horário de recebimento do servidor, não com o `Event-Timestamp` do NAS. Isso evita que um relógio errado no equipamento, por exemplo em 1970, apareça como início da sessão no painel. Mantenha NTP ativo no servidor e no NAS; o horário do servidor deve estar correto porque ele passa a ser a referência do accounting.

## CoA/Disconnect

Ao encerrar uma sessão no painel, a API envia um **Disconnect-Request** RFC 5176 ao NAS pela porta UDP configurada, por padrão **3799**. O pacote identifica a sessão com `User-Name`, `Acct-Session-Id`, `NAS-IP-Address`, `NAS-Identifier` e, quando disponível, `Framed-IP-Address`.

O resultado é registrado no retorno da API:

- `disconnected: true` e `coaStatus: "ack"`: o NAS confirmou a desconexão.
- `coaStatus: "nak"`: o NAS recusou o pedido, por exemplo, sessão não encontrada.
- `coaStatus: "timeout"`: o NAS não respondeu.
- `coaStatus: "error"`: falha de rede, secret ou cadastro do NAS.

Em qualquer caso, o accounting do painel é encerrado. Se o CoA falhar, a sessão pode continuar ativa no equipamento até o próximo keepalive ou até o NAS encerrar por conta própria.

### MikroTik

```text
/radius incoming set accept=yes port=3799
/ip firewall filter add chain=input protocol=udp dst-port=3799 src-address=<IP_DO_SERVIDOR> action=accept
```

O NAS precisa usar o mesmo shared secret do RADIUS e permitir UDP 3799 a partir do IP de origem da API. O IP de origem é o IP do host Docker depois do NAT. Se a API e o FreeRADIUS estiverem em hosts diferentes, libere o IP da API.

No MikroTik, o IP de origem do Disconnect-Request precisa ser **o mesmo IP configurado como servidor RADIUS** em `/radius`. Se a autenticação chega pelo IP público e o CoA sai pelo IP da LAN, o RouterOS conta **Bad Requests** e não responde. Nesse caso, use o mesmo IP nos dois sentidos ou adicione uma entrada de servidor RADIUS com o IP de origem do CoA.

Variáveis:

```env
RADIUS_COA_PORT=3799
RADIUS_COA_TIMEOUT_MS=2000
```

O cliente envia o pedido, reenvia uma vez com o mesmo identificador e autenticador e valida o `Disconnect-ACK`/`Disconnect-NAK` pelo shared secret. O portal não usa `Packet of Disconnect` (POD), apenas Disconnect-Request padrão. O painel edita os atributos em **Grupos** → **Editar atributos**. Ao salvar, a API reescreve `radgroupreply` na hora, sem restart. Se o grupo ainda não tiver um `radiusGroupName`, a API usa o `slug` e ressincroniza os membros.

Atributos de autorização variam por fabricante. Não presuma que um VSA da MikroTik funciona em Huawei, Nokia ou ZTE. Valide o dicionário do equipamento antes de produção.

## Bloqueio e expiração

Quando uma identidade está bloqueada, removida ou fora da validade, a API remove as credenciais e grava:

```text
radcheck: Auth-Type := Reject
radreply: Reply-Message = "Conta bloqueada" (ou "Credencial expirada")
```

O teste com conta bloqueada retorna Access-Reject com a mensagem, sem autenticar.

## Permissões de acesso por equipamento

O vínculo `Device.authorizedGroups` é aplicado pelo FreeRADIUS em tempo real. Duas views no PostgreSQL expõem o modelo Prisma para o RADIUS:

- `radius_device_inventory`: lista os NAS cadastrados por `nas_ip`.
- `radius_device_access`: lista pares `nas_ip` e `login` permitidos, derivados dos grupos do equipamento e dos grupos da identidade.

A política `device_access` em `policy.d/device-access` é executada depois do módulo `sql` no `authorize`. Se o NAS estiver cadastrado e a identidade não pertencer a nenhum grupo autorizado, a resposta é `Access-Reject` com `Reply-Message = "Seu grupo nao tem acesso a este equipamento"`.

O cliente de teste `127.0.0.1` não é um equipamento cadastrado e permanece liberado para os testes de `radtest`. Um NAS real sempre deve estar cadastrado com grupos autorizados.

## Atributos por grupo

Os atributos de resposta vêm exclusivamente dos grupos da identidade, não do equipamento. A identidade herda os atributos de todos os seus grupos por meio de `radusergroup` + `radgroupreply`.

- Atributos comuns: `Session-Timeout`, `Idle-Timeout`, `Acct-Interim-Interval`, `Filter-Id`.
- VSAs: `Mikrotik-Group`, `Mikrotik-Rate-Limit`, `Cisco-AVPair`, `Huawei-Exec-Privilege`.
- O painel oferece sugestões, mas aceita qualquer nome e valor.
- Uma identidade em vários grupos recebe a união dos atributos. Em conflito, a ordem de prioridade do `radusergroup` decide; evite valores conflitantes.
- VSA e dicionários variam por fabricante, modelo e firmware. Valide antes de produção.

Os atributos valem para qualquer NAS em que a identidade autentique. Para restringir o acesso a um equipamento, use os grupos autorizados do NAS; para mudar o que é devolvido ao NAS, edite o grupo.

Grupos, atributos e clientes são lidos em tempo real. Cadastro de NAS é imediato; rotação de segredo e exclusão valem em até 60 segundos.

## NAS clients

Ao cadastrar um equipamento, a API gera um shared secret aleatório ou usa o valor informado, cifra com AES-256-GCM em `devices.secretCipher` e grava o valor em `nas` para o FreeRADIUS. O segredo informado precisa ter de 16 a 60 caracteres imprimíveis, sem espaço no início ou no fim. O mesmo vale para a rotação. Segredos legados de NAS podem permanecer até a janela de rotação.

Os clientes são resolvidos sob demanda, sem reiniciar o FreeRADIUS:

1. O virtual server `dynamic_clients` recebe o pacote e consulta a tabela `nas` pelo IP de origem.
2. Se o IP estiver cadastrado, o cliente é criado em memória com o segredo da tabela e fica em cache por 60 segundos.
3. Se o IP não estiver cadastrado, o pacote é descartado. O fallback `0.0.0.0/0` só existe se `RADIUS_ALLOW_WILDCARD_NAS=true`.
4. Se o segredo estiver errado, o pacote também é descartado.

Consequências:

- Cadastrar um equipamento no painel o habilita imediatamente, sem restart.
- Rotacionar o segredo ou excluir o equipamento passa a valer em até 60 segundos (tempo do cache).
- O shared secret aparece uma única vez no painel, no momento da criação ou rotação.
- O `nas` precisa do segredo em claro para validar requisições. O banco deve ser interno e com acesso restrito.

Apenas o cliente de teste `127.0.0.1` é estático, em `infra/freeradius/clients.template`. Não existe cliente estático para as redes internas do compose: um serviço interno que envie RADIUS também precisa estar cadastrado. A rede do compose não usa `172.x`, para não conflitar com os equipamentos gerenciados.

### NAS curinga (`0.0.0.0/0`)

O modo curinga é desabilitado por padrão e foi removido deste ambiente. Os IPs reais observados foram migrados para cadastros exatos com os mesmos grupos autorizados e o mesmo shared secret legado.

- Para reabilitar conscientemente, defina `RADIUS_ALLOW_WILDCARD_NAS=true` e crie um único NAS `0.0.0.0/0`.
- O IP exato sempre tem precedência sobre o curinga.
- O shared secret é único para todos os equipamentos não cadastrados. Um vazamento compromete todos.
- Prefira cadastro individual em produção.

Como o servidor ainda recebe pacotes endereçados ao cliente dinâmico, restrinja UDP 1812 e 1813 na borda (host ou firewall) às redes de gerência dos NAS. Um IP não cadastrado não autentica, mas ainda gera uma consulta ao banco.

## Autenticação sem accounting

Uma autenticação aceita grava `radpostauth` e atualiza a presença do NAS, mas **não cria sessão**. A lista de sessões é alimentada exclusivamente pelo `radacct`.

Se o equipamento autenticar e não enviar `Acct-Status-Type=Start` para UDP 1813, o painel mostrará o equipamento online e a autenticação aceita, porém nenhuma sessão ativa. Habilite accounting no equipamento ou reconecte a sessão depois de configurá-lo.

## Accounting

O NAS envia Start, Interim e Stop. O FreeRADIUS grava em `radacct`; o painel lê dessa tabela. O nome exibido para o equipamento vem do `NAS-Identifier` registrado em `radpostauth`, com fallback para o nome do NAS cadastrado e para o IP.

- O worker atualiza `lastAuthAt` e `lastSeenAt` a cada minuto.
- O encerramento pelo painel atualiza `acctstoptime` e `acctterminatecause`, mas não envia CoA/Disconnect.
- Sessões encerradas são limpas conforme `sessionRetentionDays`.
- `radpostauth` guarda apenas `username`, `pass` vazio, `reply`, data, NAS e método. Nunca a senha.

## Teste completo

```bash
./scripts/radius-smoke.sh
```

Saída esperada:

```text
1) autenticação válida
   OK: Access-Accept
2) senha inválida
   OK: Access-Reject
3) accounting Start, Interim e Stop
   OK: sessão smoke-... encerrada no accounting
RADIUS: todos os testes passaram.
```

## Diagnóstico

```bash
docker compose logs -f freeradius
docker compose exec freeradius freeradius -XC      # valida a configuração
docker compose exec postgres psql -U aaa -d aaa_manager \
  -c "select username, attribute, value from radcheck;" \
  -c "select username, groupname from radusergroup;" \
  -c "select * from radpostauth order by id desc limit 5;" \
  -c "select acctsessionid, username, acctstarttime, acctstoptime from radacct order by radacctid desc limit 5;"
```

Se a autenticação falhar:

1. Confirme que a identidade está ativa e com `NT-Password` em `radcheck`.
2. Confirme o grupo em `radusergroup` e os atributos em `radgroupreply`.
3. Verifique o segredo do NAS em `nas` e em `clients.conf`.
4. Reinicie o FreeRADIUS após mudanças de NAS.
5. Rode `freeradius -XC` e leia o primeiro erro, não o último.

## Produção

RADIUS tradicional usa UDP e não cifra o conteúdo. Mitigações:

- Rede de gerência isolada ou VPN de transporte.
- RadSec (RADIUS sobre TLS) quando o NAS suportar.
- Segredo distinto por equipamento, rotação periódica e cofre de segredos.
- Desabilitar PAP fora da rede de gerência.
- Monitorar falhas sem registrar atributos sensíveis.
