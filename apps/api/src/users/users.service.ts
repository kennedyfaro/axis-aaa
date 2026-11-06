import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  type OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, type UserStatus } from "@prisma/client";
import { timingSafeEqual } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { authenticator } from "otplib";
import type { Request } from "express";
import { PrismaService } from "../common/prisma.service";
import { RadiusService } from "../radius/radius.service";
import { SessionsService } from "../sessions/sessions.service";
import { AuditService } from "../common/audit.service";
import { ntPassword, randomToken } from "../common/crypto";
import { csvRows } from "../common/csv";
import { errorSummary } from "../common/error";
import { encryptTotpSecret, isEncryptedTotpSecret } from "../common/totp-secret";
import { isVpnGroup } from "../common/radius-groups";
import type { AdminPrincipal } from "../common/auth.decorators";
import type {
  ChangeOwnPasswordDto,
  ConfigureTotpDto,
  CreateUserDto,
  ResetPasswordDto,
  UpdateSelfDto,
  UpdateUserDto,
} from "./users.dto";

const DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);
  private readonly encryptionKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly radius: RadiusService,
    private readonly sessions: SessionsService,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.encryptionKey = config.get<string>("ENCRYPTION_KEY") ?? "";
  }

  async onModuleInit() {
    try {
      const users = await this.prisma.user.findMany({
        where: { deletedAt: null },
        include: { groups: true },
      });
      for (const user of users) {
        if (user.radiusNtHash) await this.syncPanelAccount(user, false);
      }
    } catch (error) {
      this.logger.warn(`Sincronização de contas de painel adiada (${errorSummary(error)}).`);
    }
  }

  async list(params: { query?: string; status?: string; group?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.min(100, Math.max(5, Number(params.pageSize) || 10));
    const query = (params.query ?? "").trim();
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(params.status && params.status !== "all"
        ? { status: params.status.toUpperCase() as UserStatus }
        : {}),
      ...(params.group && params.group !== "all" ? { groups: { some: { id: params.group } } } : {}),
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { login: { contains: query, mode: "insensitive" } },
              { email: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: { groups: true },
        orderBy: { createdAt: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items: items.map((user) => this.toDto(user)), total, page, pageSize };
  }

  async detail(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: { groups: true },
    });
    if (!user) throw new NotFoundException("Usuário não encontrado.");
    return {
      user: this.toDto(user),
      groups: user.groups.map((group) => ({
        id: group.id,
        name: group.name,
        slug: group.slug,
        description: group.description,
        kind: group.kind.toLowerCase(),
        permissions: group.permissions,
        memberCount: 0,
      })),
      sessions: await this.sessions.listForUser(user.login),
      audit: await this.audit.findForTarget(user.login),
    };
  }

  async create(dto: CreateUserDto, admin: AdminPrincipal, request: Request) {
    await this.assertCanGrantGroups(admin, dto.groupIds);
    await this.assertPasswordPolicy(dto.password);
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        login: dto.login,
        email: dto.email.toLowerCase(),
        status: "ACTIVE",
        mfa: dto.mfa,
        validFrom: new Date(),
        validUntil: this.endOfDay(dto.validUntil),
        notes: dto.notes ?? null,
        radiusNtHash: ntPassword(dto.password),
        passwordUpdatedAt: new Date(),
        groups: { connect: dto.groupIds.map((id) => ({ id })) },
      },
      include: { groups: true },
    });
    await this.radius.syncUser(user);
    const panel = await this.syncPanelAccount(user);
    await this.audit.record({
      admin,
      action: "user.created",
      target: user.login,
      request,
      metadata: { groups: String(dto.groupIds.length), mfa: dto.mfa },
    });
    return this.withPanelSecret(user, panel);
  }

  async update(id: string, dto: UpdateUserDto, admin: AdminPrincipal, request: Request) {
    const current = await this.prisma.user.findUnique({ where: { id }, include: { groups: true } });
    if (!current) throw new NotFoundException("Usuário não encontrado.");
    await this.assertCanManage(admin, current);
    if (id === admin.userId && (dto.groupIds !== undefined || dto.status !== undefined)) {
      throw new ForbiddenException("Você não pode alterar seus próprios grupos ou status.");
    }
    if (dto.groupIds) await this.assertCanGrantGroups(admin, dto.groupIds);

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.email !== undefined ? { email: dto.email.toLowerCase() } : {}),
        ...(dto.mfa !== undefined ? { mfa: dto.mfa } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.validUntil !== undefined ? { validUntil: this.endOfDay(dto.validUntil) } : {}),
        ...(dto.status ? { status: dto.status.toUpperCase() as UserStatus } : {}),
        ...(dto.groupIds ? { groups: { set: dto.groupIds.map((groupId) => ({ id: groupId })) } } : {}),
      },
      include: { groups: true },
    });

    let effective = user;
    if (user.framedIpAddress && !user.groups.some(isVpnGroup)) {
      const address = user.framedIpAddress;
      effective = await this.prisma.user.update({
        where: { id: user.id },
        data: { framedIpAddress: null, ipPoolId: null, ipAssignedAt: null },
        include: { groups: true },
      });
      await this.audit.record({
        admin,
        action: "pool.address.released",
        target: user.login,
        request,
        metadata: { address, reason: "group-removed" },
      });
    }

    await this.radius.syncUser(effective);
    const panel = await this.syncPanelAccount(effective);

    // Alterações de status, validade ou grupos mudam a autorização da
    // identidade. Encerra sessões RADIUS ativas e, quando necessário,
    // invalida os tokens de painel já emitidos.
    const sessionsChanged =
      dto.status !== undefined ||
      dto.validUntil !== undefined ||
      dto.groupIds !== undefined;
    const revoked = sessionsChanged
      ? await this.sessions.revokeAllForUser(effective.login)
      : { revoked: 0, disconnected: 0 };
    const panelSessionsRevoked =
      dto.validUntil !== undefined || dto.groupIds !== undefined
        ? await this.revokePanelSessions(effective.id)
        : 0;

    await this.audit.record({
      admin,
      action: "user.updated",
      target: user.login,
      request,
      metadata: {
        fields: Object.keys(dto).join(","),
        ...(sessionsChanged
          ? {
              revokedSessions: revoked.revoked,
              coaDisconnected: revoked.disconnected,
              panelSessionsRevoked,
            }
          : {}),
      },
    });
    return this.withPanelSecret(effective, panel);
  }

  async block(id: string, admin: AdminPrincipal, request: Request) {
    const current = await this.prisma.user.findUnique({ where: { id }, include: { groups: true } });
    if (!current) throw new NotFoundException("Usuário não encontrado.");
    await this.assertCanManage(admin, current);
    const user = await this.prisma.user.update({
      where: { id },
      data: { status: "BLOCKED" },
      include: { groups: true },
    });
    await this.radius.syncUser(user);
    await this.syncPanelAccount(user, false);
    const revoked = await this.sessions.revokeAllForUser(user.login);
    await this.audit.record({
      admin,
      action: "user.blocked",
      target: user.login,
      request,
      metadata: {
        revokedSessions: revoked.revoked,
        coaDisconnected: revoked.disconnected,
      },
    });
    return { user: this.toDto(user), ...revoked };
  }

  async unblock(id: string, admin: AdminPrincipal, request: Request) {
    const current = await this.prisma.user.findUnique({ where: { id }, include: { groups: true } });
    if (!current) throw new NotFoundException("Usuário não encontrado.");
    await this.assertCanManage(admin, current);
    const user = await this.prisma.user.update({
      where: { id },
      data: { status: "ACTIVE" },
      include: { groups: true },
    });
    await this.radius.syncUser(user);
    await this.syncPanelAccount(user, false);
    await this.audit.record({
      admin,
      action: "user.unblocked",
      target: user.login,
      request,
      metadata: null,
    });
    return { user: this.toDto(user), revoked: 0, disconnected: 0 };
  }

  async revokeSessions(id: string, admin: AdminPrincipal, request: Request) {
    const user = await this.prisma.user.findUnique({ where: { id }, include: { groups: true } });
    if (!user) throw new NotFoundException("Usuário não encontrado.");
    await this.assertCanManage(admin, user);
    const revoked = await this.sessions.revokeAllForUser(user.login);
    await this.audit.record({
      admin,
      action: "user.sessions.revoked",
      target: user.login,
      request,
      metadata: {
        revokedSessions: revoked.revoked,
        coaDisconnected: revoked.disconnected,
      },
    });
    return revoked;
  }

  async resetPassword(id: string, dto: ResetPasswordDto, admin: AdminPrincipal, request: Request) {
    await this.assertPasswordPolicy(dto.password);
    const current = await this.prisma.user.findUnique({ where: { id }, include: { groups: true } });
    if (!current) throw new NotFoundException("Usuário não encontrado.");
    await this.assertCanManage(admin, current);
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        radiusNtHash: ntPassword(dto.password),
        passwordUpdatedAt: new Date(),
      },
      include: { groups: true },
    });
    await this.radius.syncUser(user);
    const revoked = await this.sessions.revokeAllForUser(user.login);
    const panelSessionsRevoked = await this.revokePanelSessions(user.id);
    await this.audit.record({
      admin,
      action: "user.password.reset",
      target: user.login,
      request,
      metadata: {
        revokedSessions: revoked.revoked,
        coaDisconnected: revoked.disconnected,
        panelSessionsRevoked,
      },
    });
    return { ok: true, ...revoked, panelSessionsRevoked };
  }

  async remove(id: string, admin: AdminPrincipal, request: Request) {
    const current = await this.prisma.user.findUnique({ where: { id }, include: { groups: true } });
    if (!current) throw new NotFoundException("Usuário não encontrado.");
    await this.assertCanManage(admin, current);
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: "BLOCKED",
        framedIpAddress: null,
        ipPoolId: null,
        ipAssignedAt: null,
      },
      include: { groups: true },
    });
    const revoked = await this.sessions.revokeAllForUser(user.login);
    await this.radius.removeUser(user.login);
    await this.syncPanelAccount(user, false);
    await this.audit.record({
      admin,
      action: "user.deleted",
      target: user.login,
      request,
      metadata: {
        mode: "soft-delete",
        revokedSessions: revoked.revoked,
        coaDisconnected: revoked.disconnected,
      },
    });
    return { ok: true, ...revoked };
  }

  async exportCsv() {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null },
      include: { groups: true },
      orderBy: { name: "asc" },
    });
    const header = ["nome", "login", "email", "status", "grupos", "mfa", "valido_ate", "ultimo_acesso"];
    const rows = users.map((user) => [
      user.name,
      user.login,
      user.email,
      user.status.toLowerCase(),
      user.groups.map((group) => group.name).join(" | "),
      user.mfa ? "sim" : "nao",
      user.validUntil?.toISOString() ?? "",
      user.lastAuthAt?.toISOString() ?? "",
    ]);
    return csvRows(header, rows);
  }

  async findLogin(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { login: true } });
    return user?.login;
  }

  async changeOwnPassword(
    id: string,
    dto: ChangeOwnPasswordDto,
    admin: AdminPrincipal,
    request: Request,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id }, include: { groups: true } });
    if (!user) throw new NotFoundException("Usuário não encontrado.");
    await this.assertPasswordPolicy(dto.newPassword);
    const expected = Buffer.from(user.radiusNtHash ?? "", "hex");
    const actual = Buffer.from(ntPassword(dto.currentPassword), "hex");
    if (expected.length === 0 || expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new UnauthorizedException("Senha atual incorreta.");
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { radiusNtHash: ntPassword(dto.newPassword), passwordUpdatedAt: new Date() },
      include: { groups: true },
    });
    await this.radius.syncUser(updated);
    const revoked = await this.sessions.revokeAllForUser(updated.login);
    const panelSessionsRevoked = await this.revokePanelSessions(updated.id);
    await this.audit.record({
      admin,
      action: "user.password.reset",
      target: updated.login,
      request,
      metadata: {
        self: true,
        revokedSessions: revoked.revoked,
        coaDisconnected: revoked.disconnected,
        panelSessionsRevoked,
      },
    });
    return { ok: true, ...revoked, panelSessionsRevoked };
  }

  async updateSelf(id: string, dto: UpdateSelfDto, admin: AdminPrincipal, request: Request) {
    const user = await this.prisma.user.findUnique({ where: { id }, include: { groups: true } });
    if (!user) throw new NotFoundException("Usuário não encontrado.");
    if (dto.email) {
      const taken = await this.prisma.user.findFirst({
        where: { email: dto.email.toLowerCase(), id: { not: id } },
        select: { id: true },
      });
      if (taken) throw new BadRequestException("E-mail já está em uso por outra identidade.");
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.email !== undefined ? { email: dto.email.toLowerCase() } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
      include: { groups: true },
    });

    await this.syncPanelAccount(updated, false);
    await this.audit.record({
      admin,
      action: "user.updated",
      target: updated.login,
      request,
      metadata: { self: true, fields: Object.keys(dto).join(",") },
    });
    return this.toDto(updated);
  }

  async configureTotp(id: string, dto: ConfigureTotpDto, admin: AdminPrincipal, request: Request) {
    const user = await this.prisma.user.findUnique({ where: { id }, include: { groups: true } });
    if (!user) throw new NotFoundException("Usuário não encontrado.");
    await this.assertCanManage(admin, user);
    if (!this.userIsActive(user)) {
      throw new BadRequestException("A identidade precisa estar ativa para configurar o MFA.");
    }
    if (user.groups.every((group) => group.permissions.length === 0)) {
      throw new BadRequestException("Usuário sem acesso ao painel. Adicione-o a um grupo com permissões.");
    }

    const bridge = await this.prisma.admin.findUnique({ where: { userId: id } });
    if (!bridge) {
      throw new BadRequestException(
        "Já existe uma conta de painel com este e-mail. Use a autenticação dessa conta.",
      );
    }

    const manual = dto.secret ? dto.secret.replace(/[\s-]/g, "").toUpperCase() : null;
    if (manual && !/^[A-Z2-7]{16,64}$/.test(manual)) {
      throw new BadRequestException(
        "Segredo TOTP inválido. Use Base32 de 16 a 64 caracteres (A-Z e 2-7).",
      );
    }

    const secret = manual ?? authenticator.generateSecret();
    await this.prisma.$transaction([
      this.prisma.admin.update({
        where: { id: bridge.id },
        data: {
          totpSecret: encryptTotpSecret(secret, this.encryptionKey),
          mfaEnabled: true,
        },
      }),
      this.prisma.user.update({ where: { id }, data: { mfa: true } }),
    ]);
    await this.audit.record({
      admin,
      action: "user.updated",
      target: user.login,
      request,
      metadata: { fields: "totp" },
    });
    return {
      secret,
      uri: authenticator.keyuri(user.email, "Áxis", secret),
      code: authenticator.generate(secret),
    };
  }

  private userIsActive(user: {
    status: string;
    deletedAt: Date | null;
    validFrom: Date | null;
    validUntil: Date | null;
  }) {
    const now = new Date();
    return (
      user.status === "ACTIVE" &&
      !user.deletedAt &&
      (!user.validFrom || user.validFrom <= now) &&
      (!user.validUntil || user.validUntil >= now)
    );
  }

  private async syncPanelAccount(user: {
    id: string;
    name: string;
    login: string;
    email: string;
    status: string;
    mfa: boolean;
    radiusNtHash: string | null;
    deletedAt: Date | null;
    validFrom: Date | null;
    validUntil: Date | null;
    groups: { id: string; permissions: string[] }[];
  }, allowMfaEnrollment = true): Promise<{ totpSecret: string } | null> {
    const panelGroups = user.groups.filter((group) => group.permissions.length > 0);
    const privilegedGroups = panelGroups.filter((group) =>
      group.permissions.some((permission) => !permission.startsWith("self.")),
    );
    const bridgeGroups = privilegedGroups.length > 0 ? privilegedGroups : panelGroups;
    const bridge = await this.prisma.admin.findUnique({ where: { userId: user.id } });

    if (!this.userIsActive(user) || bridgeGroups.length === 0 || !user.radiusNtHash) {
      if (bridge) {
        await this.prisma.$transaction([
          this.prisma.admin.update({
            where: { id: bridge.id },
            data: {
              status: "BLOCKED",
              // Só incrementa na transição para BLOCKED; startups repetidos
              // não precisam invalidar tokens que já estão inválidos.
              ...(bridge.status !== "BLOCKED" ? { tokenVersion: { increment: 1 } } : {}),
            },
          }),
          this.prisma.refreshToken.updateMany({
            where: { adminId: bridge.id, revokedAt: null },
            data: { revokedAt: new Date() },
          }),
        ]);
      }
      return null;
    }

    if (!bridge) {
      const sameEmail = await this.prisma.admin.findUnique({ where: { email: user.email.toLowerCase() } });
      if (sameEmail) return null;

      const generatedSecret = user.mfa ? authenticator.generateSecret() : null;
      const storedSecret = generatedSecret
        ? encryptTotpSecret(generatedSecret, this.encryptionKey)
        : null;
      await this.prisma.admin.create({
        data: {
          name: user.name,
          email: user.email.toLowerCase(),
          passwordHash: await hash(randomToken(32), { memoryCost: 19_456, timeCost: 2, parallelism: 1 }),
          userId: user.id,
          status: "ACTIVE",
          mfaEnabled: Boolean(generatedSecret),
          totpSecret: storedSecret,
          groups: { connect: bridgeGroups.map((group) => ({ id: group.id })) },
        },
      });
      return generatedSecret && allowMfaEnrollment ? { totpSecret: generatedSecret } : null;
    }

    const emailOwner = await this.prisma.admin.findUnique({ where: { email: user.email.toLowerCase() } });
    const email = emailOwner && emailOwner.id !== bridge.id ? bridge.email : user.email.toLowerCase();
    const needsSecret = user.mfa && !bridge.totpSecret;
    const generatedSecret = needsSecret ? authenticator.generateSecret() : null;
    const storedSecret = generatedSecret
      ? encryptTotpSecret(generatedSecret, this.encryptionKey)
      : bridge.totpSecret && !isEncryptedTotpSecret(bridge.totpSecret)
        ? encryptTotpSecret(bridge.totpSecret, this.encryptionKey)
        : bridge.totpSecret;

    await this.prisma.admin.update({
      where: { id: bridge.id },
      data: {
        name: user.name,
        email,
        status: "ACTIVE",
        mfaEnabled: user.mfa && Boolean(storedSecret),
        totpSecret: storedSecret,
        groups: { set: bridgeGroups.map((group) => ({ id: group.id })) },
      },
    });

    return generatedSecret && allowMfaEnrollment ? { totpSecret: generatedSecret } : null;
  }

  private withPanelSecret(
    user: Parameters<UsersService["toDto"]>[0],
    panel: { totpSecret: string } | null,
  ) {
    const dto = this.toDto(user);
    if (!panel) return dto;
    return {
      ...dto,
      totpSecret: panel.totpSecret,
      totpUri: authenticator.keyuri(user.email, "Áxis", panel.totpSecret),
    };
  }

  private async revokePanelSessions(userId: string) {
    const bridge = await this.prisma.admin.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!bridge) return 0;
    const result = await this.prisma.$transaction([
      this.prisma.admin.update({
        where: { id: bridge.id },
        data: { tokenVersion: { increment: 1 } },
      }),
      this.prisma.refreshToken.updateMany({
        where: { adminId: bridge.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return result[1].count;
  }

  private async assertPasswordPolicy(password: string) {
    const settings = await this.prisma.setting.findUnique({
      where: { id: 1 },
      select: { passwordMinLength: true },
    });
    // A política administrativa pode aumentar o mínimo, mas nunca reduzi-lo
    // abaixo do piso de segurança de 14 caracteres.
    const minimum = Math.max(14, Math.min(64, settings?.passwordMinLength ?? 14));
    if (password.length < minimum) {
      throw new BadRequestException(`A senha deve ter ao menos ${minimum} caracteres.`);
    }
  }

  private privilegedPermissions(permissions: string[]) {
    return permissions.filter((permission) => !permission.startsWith("self."));
  }

  private async assertCanManage(
    admin: AdminPrincipal,
    target: { id: string; groups: { permissions: string[] }[] },
  ) {
    // A própria identidade é tratada pelos endpoints /me e por checagens
    // específicas de autoalteração. Aqui o foco é impedir que um perfil
    // delegado gerencie identidades com permissões administrativas maiores.
    if (target.id === admin.userId) return;

    const actor = new Set(this.privilegedPermissions(admin.permissions));
    const targetPermissions = new Set(
      target.groups.flatMap((group) => this.privilegedPermissions(group.permissions)),
    );
    const missing = [...targetPermissions].filter((permission) => !actor.has(permission));
    if (missing.length > 0) {
      throw new ForbiddenException(
        "Você não pode gerenciar uma identidade com permissões superiores às suas.",
      );
    }
  }

  private async assertCanGrantGroups(admin: AdminPrincipal, groupIds: string[]) {
    const groups = await this.assertGroups(groupIds);
    const actor = new Set(this.privilegedPermissions(admin.permissions));
    const missing = groups.flatMap((group) =>
      this.privilegedPermissions(group.permissions).filter((permission) => !actor.has(permission)),
    );
    if (missing.length > 0) {
      throw new ForbiddenException("Você não pode conceder permissões que não possui.");
    }
  }

  private async assertGroups(groupIds: string[]) {
    const uniqueIds = [...new Set(groupIds)];
    const groups = await this.prisma.group.findMany({ where: { id: { in: uniqueIds } } });
    if (groups.length !== uniqueIds.length) {
      throw new BadRequestException("Um ou mais grupos não existem.");
    }
    return groups;
  }

  private endOfDay(value?: string | null): Date | null {
    if (!value) return null;
    return new Date(`${value.slice(0, 10)}T23:59:59.000Z`);
  }

  private toDto(user: {
    id: string;
    name: string;
    login: string;
    email: string;
    status: string;
    groups: { id: string }[];
    mfa: boolean;
    validFrom: Date | null;
    validUntil: Date | null;
    lastAuthAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    notes: string | null;
    deletedAt: Date | null;
    framedIpAddress: string | null;
    ipPoolId: string | null;
  }) {
    return {
      id: user.id,
      name: user.name,
      login: user.login,
      email: user.email,
      status: user.status.toLowerCase(),
      groupIds: user.groups.map((group) => group.id),
      mfa: user.mfa,
      validFrom: user.validFrom?.toISOString() ?? new Date().toISOString(),
      validUntil: user.validUntil?.toISOString() ?? null,
      lastAuthAt: user.lastAuthAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      notes: user.notes,
      deletedAt: user.deletedAt?.toISOString() ?? null,
      framedIpAddress: user.framedIpAddress,
      ipPoolId: user.ipPoolId,
    };
  }
}
