import { describe, expect, it } from "vitest";
import {
  createDeviceSchema,
  createUserSchema,
  loginSchema,
  mfaSchema,
  settingsSchema,
} from "@aaa/contracts";

const validUser = {
  name: "Ana Rocha",
  login: "ana.rocha",
  email: "ana.rocha@aaa.local",
  groupIds: ["grp-rede"],
  validUntil: null,
  mfa: true,
  notes: null,
  password: "SenhaForte!2026x",
};

describe("contratos de entrada", () => {
  it("aceita identidade valida", () => {
    expect(createUserSchema.safeParse(validUser).success).toBe(true);
  });

  it("exige senha RADIUS com 14 ou mais caracteres", () => {
    const result = createUserSchema.safeParse({ ...validUser, password: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes("senha RADIUS"))).toBe(true);
    }
  });

  it("rejeita login com caracteres invalidos e grupo vazio", () => {
    const result = createUserSchema.safeParse({ ...validUser, login: "Ana Rocha", groupIds: [] });
    expect(result.success).toBe(false);
  });

  it("exige senha mínima no login", () => {
    expect(loginSchema.safeParse({ email: "admin@aaa.local", password: "curta" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "admin@aaa.local", password: "senha-longa-123" }).success).toBe(true);
  });

  it("valida codigo MFA de seis digitos", () => {
    expect(mfaSchema.safeParse({ challengeId: "abc", code: "000000" }).success).toBe(true);
    expect(mfaSchema.safeParse({ challengeId: "abc", code: "12ab" }).success).toBe(false);
  });

  it("rejeita IPv4 invalido em equipamento", () => {
    const device = {
      name: "edge-rt-sp01",
      description: "Roteador de borda",
      vendor: "mikrotik",
      model: "CCR2004",
      kind: "router",
      ip: "10.10.0.999",
      nasIdentifier: "edge-rt-sp01",
      site: "São Paulo",
      environment: "production",
      authorizedGroupIds: ["grp-neteng"],
    };
    expect(createDeviceSchema.safeParse(device).success).toBe(false);
    expect(createDeviceSchema.safeParse({ ...device, ip: "10.10.0.1" }).success).toBe(true);
  });

  it("limita retencao e politica de senha", () => {
    const base = {
      organization: "Aurora Redes",
      timezone: "America/Sao_Paulo",
      sessionTimeoutMinutes: 30,
      mfaRequired: true,
      passwordMinLength: 14,
      passwordRotationDays: 90,
      maxLoginAttempts: 5,
      auditRetentionDays: 365,
      sessionRetentionDays: 90,
      notificationsEmail: true,
      notificationsWebhook: false,
      webhookUrl: null,
    };
    expect(settingsSchema.safeParse(base).success).toBe(true);
    expect(settingsSchema.safeParse({ ...base, passwordMinLength: 8 }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...base, auditRetentionDays: 10 }).success).toBe(false);
  });
});
