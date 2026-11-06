import { describe, expect, it } from "vitest";
import {
  ALLOWED_RADIUS_REPLY_ATTRIBUTES,
  assertAllowedRadiusAttribute,
} from "../src/groups/radius-attributes";

describe("allowlist de atributos RADIUS", () => {
  it("aceita os atributos usados pelos perfis atuais", () => {
    for (const attribute of [
      "Session-Timeout",
      "Idle-Timeout",
      "Acct-Interim-Interval",
      "Framed-Protocol",
      "Mikrotik-Group",
      "Cisco-AVPair",
      "Huawei-Exec-Privilege",
    ]) {
      expect(ALLOWED_RADIUS_REPLY_ATTRIBUTES.has(attribute)).toBe(true);
      expect(() => assertAllowedRadiusAttribute(attribute)).not.toThrow();
    }
  });

  it("rejeita atributos de controle/autenticação", () => {
    for (const attribute of [
      "Auth-Type",
      "NT-Password",
      "Cleartext-Password",
      "Expiration",
    ]) {
      expect(() => assertAllowedRadiusAttribute(attribute)).toThrow(/não permitido/);
    }
  });

  it("rejeita atributos de rede controlados pelo pool", () => {
    for (const attribute of ["Framed-IP-Address", "Reply-Message", "Tunnel-Type"]) {
      expect(() => assertAllowedRadiusAttribute(attribute)).toThrow(/não permitido/);
    }
  });
});
