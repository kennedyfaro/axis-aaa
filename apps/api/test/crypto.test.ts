import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, ntPassword, safeEqual } from "../src/common/crypto";
import { PERMISSIONS } from "../src/common/permissions";

describe("credenciais RADIUS", () => {
  it("gera NT-Password conhecido para MS-CHAPv2", () => {
    expect(ntPassword("password")).toBe("8846F7EAEE8FB117AD06BDD830B7586C");
    expect(ntPassword("Radius!Demo2026")).toBe("27F2099E7BDCE3974752E3B69BF0F585");
  });

  it("cifra e decifra o shared secret do NAS com AES-GCM", () => {
    const key = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const encrypted = encryptSecret("segredo-do-nas", key);
    expect(encrypted).not.toContain("segredo-do-nas");
    expect(decryptSecret(encrypted, key)).toBe("segredo-do-nas");
  });

  it("compara tokens em tempo constante", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });

  it("nao expoe permissões de VPN no contrato", () => {
    expect(PERMISSIONS.some((permission) => permission.includes("vpn"))).toBe(false);
    expect(PERMISSIONS).toContain("sessions.revoke");
    expect(PERMISSIONS).toContain("audit.export");
  });
});
