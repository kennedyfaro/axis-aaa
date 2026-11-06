import { describe, expect, it } from "vitest";
import { radiusExpiration } from "../src/radius/expiration";

describe("radiusExpiration", () => {
  it("formata a data no padrão aceito pelo módulo expiration", () => {
    expect(radiusExpiration(new Date("2026-12-31T23:59:59.000Z"))).toBe(
      "31 Dec 2026 23:59:59",
    );
  });

  it("faz padding de dia e hora", () => {
    expect(radiusExpiration(new Date("2027-01-05T04:03:02.000Z"))).toBe(
      "05 Jan 2027 04:03:02",
    );
  });
});
