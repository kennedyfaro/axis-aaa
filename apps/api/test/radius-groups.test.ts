import { describe, expect, it } from "vitest";
import { isVpnGroup } from "../src/common/radius-groups";

describe("isVpnGroup", () => {
  it("reconhece grupos de VPN pelo slug", () => {
    expect(isVpnGroup({ slug: "vpn-pptp", radiusAttributes: null })).toBe(true);
    expect(isVpnGroup({ slug: "vpn-l2tp", radiusAttributes: null })).toBe(true);
  });

  it("reconhece grupo com Framed-Protocol PPP", () => {
    expect(
      isVpnGroup({ slug: "acesso-especial", radiusAttributes: { "Framed-Protocol": "PPP" } }),
    ).toBe(true);
  });

  it("ignora grupos sem perfil PPP", () => {
    expect(isVpnGroup({ slug: "acesso-full", radiusAttributes: null })).toBe(false);
    expect(
      isVpnGroup({ slug: "acesso-full", radiusAttributes: { "Mikrotik-Group": "full" } }),
    ).toBe(false);
  });
});
