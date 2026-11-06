import type { Group } from "@prisma/client";

type GroupLike = Pick<Group, "slug" | "radiusAttributes">;

/**
 * Grupos de VPN habilitam endereço fixo por identidade.
 * O slug cobre os grupos operacionais (vpn-pptp, vpn-l2tp) e o atributo
 * Framed-Protocol=PPP cobre grupos criados manualmente com perfil PPP.
 */
export function isVpnGroup(group: GroupLike): boolean {
  if (group.slug.startsWith("vpn-")) return true;
  const attributes = group.radiusAttributes;
  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) return false;
  return (attributes as Record<string, unknown>)["Framed-Protocol"] === "PPP";
}
