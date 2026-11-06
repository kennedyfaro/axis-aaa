import { Injectable } from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";
import type { AdminPrincipal } from "../common/auth.decorators";
import type { UpdateSettingsDto } from "./settings.dto";

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get() {
    const settings = await this.prisma.setting.findUnique({ where: { id: 1 } });
    if (settings) return this.toDto(settings);
    const created = await this.prisma.setting.create({ data: { id: 1 } });
    return this.toDto(created);
  }

  async update(dto: UpdateSettingsDto, admin: AdminPrincipal, request: Request) {
    // Persistir o valor efetivo evita que a UI mostre um número diferente do
    // que o backend aplica (ex.: timeout de 999 min ou senha mínima de 4).
    const effective: UpdateSettingsDto = {
      ...dto,
      ...(dto.sessionTimeoutMinutes !== undefined
        ? { sessionTimeoutMinutes: Math.min(15, Math.max(5, dto.sessionTimeoutMinutes)) }
        : {}),
      ...(dto.passwordMinLength !== undefined
        ? { passwordMinLength: Math.max(14, dto.passwordMinLength) }
        : {}),
    };
    const settings = await this.prisma.setting.upsert({
      where: { id: 1 },
      create: { id: 1, ...effective },
      update: effective,
    });
    await this.audit.record({
      admin,
      action: "settings.updated",
      target: "Configurações administrativas",
      request,
      metadata: { fields: Object.keys(dto).join(",") },
    });
    return this.toDto(settings);
  }

  private toDto(settings: {
    organization: string;
    timezone: string;
    sessionTimeoutMinutes: number;
    mfaRequired: boolean;
    passwordMinLength: number;
    passwordRotationDays: number;
    maxLoginAttempts: number;
    auditRetentionDays: number;
    sessionRetentionDays: number;
    notificationsEmail: boolean;
    notificationsWebhook: boolean;
    webhookUrl: string | null;
  }) {
    return {
      organization: settings.organization,
      timezone: settings.timezone,
      sessionTimeoutMinutes: Math.min(15, Math.max(5, settings.sessionTimeoutMinutes)),
      mfaRequired: settings.mfaRequired,
      passwordMinLength: Math.max(14, settings.passwordMinLength),
      passwordRotationDays: settings.passwordRotationDays,
      maxLoginAttempts: settings.maxLoginAttempts,
      auditRetentionDays: settings.auditRetentionDays,
      sessionRetentionDays: settings.sessionRetentionDays,
      notificationsEmail: settings.notificationsEmail,
      notificationsWebhook: settings.notificationsWebhook,
      webhookUrl: settings.webhookUrl,
    };
  }
}
