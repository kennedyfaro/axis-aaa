import { describe, expect, it } from "vitest";
import { bootstrapMessage } from "../src/common/bootstrap-message";

describe("bootstrap", () => {
  it("não imprime o segredo TOTP quando ele é gravado em arquivo", () => {
    const message = bootstrapMessage("admin@aaa.local", "/tmp/totp.txt");
    expect(message).toContain("admin@aaa.local");
    expect(message).toContain("/tmp/totp.txt");
    expect(message).not.toContain("Segredo TOTP:");
    expect(message).not.toMatch(/[A-Z2-7]{16,}/);
  });

  it("não imprime o segredo quando veio de variável de ambiente", () => {
    const message = bootstrapMessage("admin@aaa.local", null);
    expect(message).toContain("BOOTSTRAP_ADMIN_TOTP_SECRET");
    expect(message).not.toContain("otpauth://");
  });
});
