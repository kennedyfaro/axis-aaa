/**
 * Allowlist de atributos de resposta RADIUS aceitos em grupos.
 *
 * A lista cobre os atributos usados pelos perfis atuais (PPP, timeouts,
 * filtros e VSAs de gerência dos fabricantes suportados). Atributos de
 * controle/autenticação ficam de fora de propósito: permitir que um perfil
 * com `groups.write` grave `Auth-Type`, `Framed-IP-Address` ou `Tunnel-*`
 * permitiria alterar o resultado da autenticação ou a rede do NAS.
 */
export const ALLOWED_RADIUS_REPLY_ATTRIBUTES = new Set([
  "Session-Timeout",
  "Idle-Timeout",
  "Acct-Interim-Interval",
  "Framed-Protocol",
  "Filter-Id",
  "Port-Limit",
  "Mikrotik-Group",
  "Mikrotik-Rate-Limit",
  "Mikrotik-Address-List",
  "Cisco-AVPair",
  "Huawei-Exec-Privilege",
  "Juniper-Local-User-Name",
  "Juniper-User-Priority",
  "Fortinet-Group-Name",
  "Fortinet-Access-Profile",
  "Aruba-User-Role",
  "Aruba-User-Vlan",
  "H3C-User-Role",
  "H3C-User-Priority",
]);

export const DENIED_RADIUS_ATTRIBUTES = new Set([
  "Auth-Type",
  "User-Password",
  "NT-Password",
  "Cleartext-Password",
  "Crypt-Password",
  "MD5-Password",
  "SHA-Password",
  "Expiration",
  "Proxy-To-Realm",
  "Framed-IP-Address",
  "Reply-Message",
  "Class",
]);

export function assertAllowedRadiusAttribute(attribute: string) {
  if (DENIED_RADIUS_ATTRIBUTES.has(attribute)) {
    throw new Error(`Atributo de controle não permitido: ${attribute}.`);
  }
  if (!ALLOWED_RADIUS_REPLY_ATTRIBUTES.has(attribute)) {
    throw new Error(
      `Atributo não permitido: ${attribute}. Use um atributo de resposta suportado.`,
    );
  }
}
