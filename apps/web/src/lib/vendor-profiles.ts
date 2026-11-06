import type { DeviceVendor } from "@aaa/contracts";

export interface VendorProfile {
  label: string;
  nasNote: string;
  snippet: string;
  caveat: string;
}

export const VENDOR_PROFILES: Record<DeviceVendor, VendorProfile> = {
  mikrotik: {
    label: "MikroTik RouterOS",
    nasNote: "O NAS envia Access-Request em UDP/1812 e Accounting em UDP/1813.",
    snippet: `/radius add service=login address=<RADIUS_IP> secret=<SEGREDO> timeout=3s
/user aaa set use-radius=yes default-group=read
/radius print`,
    caveat:
      "Sintaxe ilustrativa para RouterOS 7. Valide na versão exata do firmware. Atributos de grupo e privilégio usam VSAs da MikroTik e podem diferir entre releases.",
  },
  huawei: {
    label: "Huawei VRP",
    nasNote: "Configure o template RADIUS e aplique o esquema AAA na linha de gerência.",
    snippet: `radius-server template AAA
 radius-server shared-key cipher <SEGREDO>
 radius-server authentication <RADIUS_IP> 1812 weight 80
aaa
 authentication-scheme gerência
  authentication-mode radius
  accounting-mode radius
 domain default
  authentication-scheme gerência`,
    caveat:
      "Sintaxe ilustrativa para VRP. Modelos NE e CloudEngine usam perfis de autorização distintos. Não presuma que os mesmos VSAs funcionam em todas as linhas.",
  },
  nokia: {
    label: "Nokia SR OS",
    nasNote: "O perfil de autenticação precisa ser associado ao contexto de gerenciamento correto.",
    snippet: `configure system security radius
    server 1 address <RADIUS_IP> secret <SEGREDO> create
    server 1 authentication-key <SEGREDO> hash2 create
    server 1 timeout 3 create
exit
configure system security user-params
    local-user-authentication-order radius
exit`,
    caveat:
      "Sintaxe ilustrativa para SR OS. Em ambientes com TACACS+ e RADIUS, a ordem de autenticação define o comportamento de fallback.",
  },
  zte: {
    label: "ZTE OLT / switch",
    nasNote: "OLTs costumam usar autorização por perfil local, com atributos especificos de acesso.",
    snippet: `radius-server host <RADIUS_IP> key <SEGREDO>
radius-server authentication <RADIUS_IP> 1812
aaa authentication radius
show radius-server`,
    caveat:
      "Sintaxe ilustrativa para C320. A disponibilidade de VSA para perfil e VLAN varia por familia e firmware. Teste em laboratorio antes do roll-out.",
  },
  cisco: {
    label: "Cisco IOS-XE",
    nasNote: "O grupo RADIUS deve ser aplicado nas linhas de console, VTY e HTTP de gerência.",
    snippet: `radius server AAA-RADIUS
 address ipv4 <RADIUS_IP> auth-port 1812 acct-port 1813
 key <SEGREDO>
aaa group server radius AAA
 server name AAA-RADIUS
aaa authentication login default group AAA local
aaa authorization exec default group AAA local
line vty 0 15
 login authentication default`,
    caveat:
      "Sintaxe ilustrativa para IOS-XE. O fallback local deve ser decidido com cuidado: ele mantem acesso quando o RADIUS cai, mas contorna a política central.",
  },
  other: {
    label: "Perfil generico",
    nasNote: "Cadastre o equipamento como NAS client no FreeRADIUS antes de habilitar o login central.",
    snippet: `client <NAS_IDENTIFIER> {
  ipaddr = <NAS_IP>
  secret = <SEGREDO>
  require_message_authenticator = auto
  nas_type = other
}`,
    caveat:
      "Perfil sem validação de fabricante. Confirme suporte a RADIUS, atributos de autorização e accounting antes de aplicar em produção.",
  },
};
