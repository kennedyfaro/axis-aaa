import {
  HttpException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { authenticator } from "otplib";
import type Redis from "ioredis";
import type { Request, Response } from "express";
import { PrismaService } from "../common/prisma.service";
import { REDIS } from "../common/redis.module";
import { AuditService } from "../common/audit.service";
import { RateLimitService } from "../common/rate-limit.service";
import { clientIp, userAgent } from "../common/request";
import { ntPassword, randomToken, sha256 } from "../common/crypto";
import { decryptTotpSecret, encryptTotpSecret } from "../common/totp-secret";
import { setAuthCookies, clearAuthCookies, REFRESH_COOKIE } from "../common/cookies";
import type { Permission } from "../common/permissions";
import type { LoginDto, MfaDto } from "./auth.dto";

interface SessionUser {
  name: string;
  email: string;
  role: string;
  permissions: Permission[];
  selfService: boolean;
}

const CHALLENGE_PREFIX = "auth:challenge:";
const ENROLL_PREFIX = "auth:enroll:";
const MFA_ATTEMPT_PREFIX = "auth:mfa:attempts:";
const MFA_MAX_ATTEMPTS = 5;
const MFA_ATTEMPT_TTL_SECONDS = 300;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly encryptionKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly rateLimit: RateLimitService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {
    this.encryptionKey = config.get<string>("ENCRYPTION_KEY") ?? "";
    authenticator.options = { window: 1 };
  }

  async login(dto: LoginDto, request: Request, response: Response) {
    const email = dto.email.trim().toLowerCase();
    await this.rateLimit.login(clientIp(request), email);

    let admin = await this.prisma.admin.findUnique({
      where: { email },
      include: { groups: true, user: true },
    });

    if (!admin) {
      const identity = await this.prisma.user.findFirst({
        where: { OR: [{ login: email }, { email }], deletedAt: null },
        include: { admin: { include: { groups: true, user: true } } },
      });
      if (identity?.admin) {
        admin = { ...identity.admin, user: identity };
      }
    }

    if (!admin || admin.status !== "ACTIVE" || (admin.userId && (!admin.user || !this.userIsActive(admin.user)))) {
      await this.audit.record({
        action: "auth.login",
        target: email,
        result: "FAILURE",
        metadata: { reason: "credenciais invalidas" },
        request,
      });
      await this.registerLoginFailure(email, undefined, request);
      throw new UnauthorizedException("E-mail ou senha incorretos.");
    }

    const valid =
      admin.userId && admin.user?.radiusNtHash
        ? this.verifyNtPassword(dto.password, admin.user.radiusNtHash)
        : await verify(admin.passwordHash, dto.password).catch(() => false);
    if (!valid) {
      await this.audit.record({
        admin: { id: admin.id, name: admin.name, role: admin.groups[0]?.name ?? "Administrador" },
        action: "auth.login",
        target: email,
        result: "FAILURE",
        metadata: { reason: "senha invalida" },
        request,
      });
      await this.registerLoginFailure(
        email,
        { id: admin.id, name: admin.name, role: admin.groups[0]?.name ?? "Administrador" },
        request,
      );
      throw new UnauthorizedException("E-mail ou senha incorretos.");
    }

    await this.rateLimit.resetAccount(email);

    if (!admin.mfaEnabled) {
      const privileged = admin.groups.some((group) =>
        group.permissions.some((permission) => !permission.startsWith("self.")),
      );

      // A configuração `mfaRequired` não pode reduzir a proteção da P0:
      // identidades administrativas sempre precisam de segundo fator.
      if (privileged) {
        // Contas administrativas nativas precisam de um segredo previamente
        // provisionado; não permitimos auto-enrollment apenas com a senha.
        if (!admin.userId) {
          throw new UnauthorizedException("MFA não configurado para esta conta administrativa.");
        }

        const secret = admin.totpSecret
          ? decryptTotpSecret(admin.totpSecret, this.encryptionKey)
          : authenticator.generateSecret();
        const challengeId = randomToken(24);
        await this.redis.set(
          `${ENROLL_PREFIX}${challengeId}`,
          JSON.stringify({ adminId: admin.id, secret }),
          "EX",
          300,
        );
        await this.audit.record({
          admin: { id: admin.id, name: admin.name, role: admin.groups[0]?.name ?? "Administrador" },
          action: "auth.mfa.enrollment",
          target: admin.email,
          result: "SUCCESS",
          metadata: { required: true, existingSecret: Boolean(admin.totpSecret) },
          request,
        });

        return {
          mfaEnrollmentRequired: true,
          challengeId,
          // O segredo só é devolvido quando ainda não existe um autenticador.
          secret: admin.totpSecret ? undefined : secret,
          uri: admin.totpSecret ? undefined : authenticator.keyuri(admin.email, "Áxis", secret),
          user: {
            name: admin.name,
            email: admin.email,
            role: admin.groups[0]?.name ?? "Administrador",
          },
        };
      }

      const user = await this.issueSession(admin, request, response);
      await this.audit.record({
        admin: { id: admin.id, name: admin.name, role: user.role },
        action: "auth.login",
        target: "Plano de gerenciamento",
        result: "SUCCESS",
        metadata: { mfa: false, source: "radius" },
        request,
      });
      return { user };
    }

    if (!admin.totpSecret) {
      this.logger.error(`Admin ${admin.email} sem segredo TOTP configurado.`);
      throw new UnauthorizedException("MFA não configurado para esta conta.");
    }

    const challengeId = randomToken(24);
    await this.redis.set(
      `${CHALLENGE_PREFIX}${challengeId}`,
      JSON.stringify({ adminId: admin.id, email: admin.email, issuedAt: Date.now() }),
      "EX",
      300,
    );

    return {
      mfaRequired: true,
      challengeId,
      user: {
        name: admin.name,
        email: admin.email,
        role: admin.groups[0]?.name ?? "Administrador",
      },
    };
  }

  async mfa(dto: MfaDto, request: Request, response: Response) {
    await this.rateLimit.mfa(clientIp(request));
    const key = `${CHALLENGE_PREFIX}${dto.challengeId}`;
    const raw = await this.redis.get(key);
    if (!raw) throw new UnauthorizedException("Desafio expirado. Entre novamente.");

    const challenge = JSON.parse(raw) as { adminId: string; email: string };
    const admin = await this.prisma.admin.findUnique({
      where: { id: challenge.adminId },
      include: { groups: true, user: true },
    });
    const actor = admin
      ? { id: admin.id, name: admin.name, role: admin.groups[0]?.name ?? "Administrador" }
      : undefined;

    if (
      !admin ||
      !admin.totpSecret ||
      admin.status !== "ACTIVE" ||
      (admin.userId && (!admin.user || !this.userIsActive(admin.user)))
    ) {
      await this.redis.del(key);
      await this.clearMfaAttempts(dto.challengeId);
      await this.audit.record({
        admin: actor,
        action: "auth.mfa.failed",
        target: admin?.email ?? challenge.email,
        result: "FAILURE",
        metadata: { reason: "sessao invalida" },
        request,
      });
      throw new UnauthorizedException("Desafio inválido.");
    }

    const attempts = await this.registerMfaAttempt(dto.challengeId);
    if (attempts > MFA_MAX_ATTEMPTS) {
      await this.redis.del(key);
      await this.clearMfaAttempts(dto.challengeId);
      await this.audit.record({
        admin: actor,
        action: "auth.mfa.locked",
        target: admin.email,
        result: "FAILURE",
        metadata: { attempts: MFA_MAX_ATTEMPTS },
        request,
      });
      throw new HttpException(
        "Muitas tentativas de código. Entre novamente.",
        429,
      );
    }

    let totpSecret: string;
    try {
      totpSecret = decryptTotpSecret(admin.totpSecret, this.encryptionKey);
    } catch {
      await this.redis.del(key);
      await this.clearMfaAttempts(dto.challengeId);
      await this.audit.record({
        admin: actor,
        action: "auth.mfa.failed",
        target: admin.email,
        result: "FAILURE",
        metadata: { reason: "segredo invalido" },
        request,
      });
      throw new UnauthorizedException("Desafio inválido.");
    }

    if (!authenticator.check(dto.code, totpSecret)) {
      await this.audit.record({
        admin: actor,
        action: "auth.mfa.failed",
        target: admin.email,
        result: "FAILURE",
        metadata: { attempt: attempts },
        request,
      });
      throw new UnauthorizedException("Código incorreto ou expirado.");
    }

    await this.redis.del(key);
    await this.clearMfaAttempts(dto.challengeId);
    const user = await this.issueSession(admin, request, response);
    await this.audit.record({
      admin: { id: admin.id, name: admin.name, role: user.role },
      action: "auth.login",
      target: "Plano de gerenciamento",
      result: "SUCCESS",
      metadata: { mfa: true },
      request,
    });
    return { user };
  }

  async enrollMfa(dto: MfaDto, request: Request, response: Response) {
    await this.rateLimit.mfa(clientIp(request));
    const key = `${ENROLL_PREFIX}${dto.challengeId}`;
    const raw = await this.redis.get(key);
    if (!raw) throw new UnauthorizedException("Desafio expirado. Entre novamente.");

    const challenge = JSON.parse(raw) as { adminId: string; secret: string };
    const admin = await this.prisma.admin.findUnique({
      where: { id: challenge.adminId },
      include: { groups: true, user: true },
    });
    if (
      !admin ||
      admin.status !== "ACTIVE" ||
      (admin.userId && (!admin.user || !this.userIsActive(admin.user)))
    ) {
      await this.redis.del(key);
      await this.clearMfaAttempts(dto.challengeId);
      throw new UnauthorizedException("Desafio inválido.");
    }

    const attempts = await this.registerMfaAttempt(dto.challengeId);
    if (attempts > MFA_MAX_ATTEMPTS) {
      await this.redis.del(key);
      await this.clearMfaAttempts(dto.challengeId);
      await this.audit.record({
        admin: { id: admin.id, name: admin.name, role: admin.groups[0]?.name ?? "Administrador" },
        action: "auth.mfa.enrollment.locked",
        target: admin.email,
        result: "FAILURE",
        metadata: { attempts: MFA_MAX_ATTEMPTS },
        request,
      });
      throw new HttpException(
        "Muitas tentativas de código. Entre novamente.",
        429,
      );
    }

    if (!authenticator.check(dto.code, challenge.secret)) {
      await this.audit.record({
        admin: { id: admin.id, name: admin.name, role: admin.groups[0]?.name ?? "Administrador" },
        action: "auth.mfa.enrollment.failed",
        target: admin.email,
        result: "FAILURE",
        metadata: { attempt: attempts },
        request,
      });
      throw new UnauthorizedException("Código incorreto ou expirado.");
    }

    await this.prisma.$transaction([
      this.prisma.admin.update({
        where: { id: admin.id },
        data: {
          totpSecret: encryptTotpSecret(challenge.secret, this.encryptionKey),
          mfaEnabled: true,
        },
      }),
      ...(admin.userId
        ? [
            this.prisma.user.update({
              where: { id: admin.userId },
              data: { mfa: true },
            }),
          ]
        : []),
    ]);
    await this.redis.del(key);
    await this.clearMfaAttempts(dto.challengeId);

    const user = await this.issueSession(admin, request, response);
    await this.audit.record({
      admin: { id: admin.id, name: admin.name, role: user.role },
      action: "auth.mfa.enrolled",
      target: admin.email,
      result: "SUCCESS",
      metadata: null,
      request,
    });
    await this.audit.record({
      admin: { id: admin.id, name: admin.name, role: user.role },
      action: "auth.login",
      target: "Plano de gerenciamento",
      result: "SUCCESS",
      metadata: { mfa: true, enrolled: true },
      request,
    });
    return { user };
  }

  async refresh(request: Request, response: Response) {
    const token = request.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!token) throw new UnauthorizedException("Sessão expirada.");

    const tokenHash = sha256(token);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { admin: { include: { groups: true, user: true } } },
    });

    if (!stored) throw new UnauthorizedException("Sessão expirada.");

    if (stored.revokedAt) {
      // Reuso de refresh token: revoga toda a familia daquele administrador
      // e invalida também os access tokens já emitidos.
      await this.prisma.$transaction([
        this.prisma.refreshToken.updateMany({
          where: { adminId: stored.adminId, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
        this.prisma.admin.update({
          where: { id: stored.adminId },
          data: { tokenVersion: { increment: 1 } },
        }),
      ]);
      clearAuthCookies(response);
      throw new UnauthorizedException("Sessão revogada. Entre novamente.");
    }

    if (
      stored.expiresAt.getTime() <= Date.now() ||
      stored.admin.status !== "ACTIVE" ||
      (stored.admin.userId && (!stored.admin.user || !this.userIsActive(stored.admin.user)))
    ) {
      clearAuthCookies(response);
      throw new UnauthorizedException("Sessão expirada.");
    }

    // Binding do refresh token: um token roubado não deve ser utilizável de
    // outro dispositivo. UA é sempre comparado; IP pode ser desativado em
    // redes com CGNAT/mudança frequente via REFRESH_BIND_IP=false.
    const bindIp = this.config.get<string>("REFRESH_BIND_IP") !== "false";
    const currentIp = clientIp(request);
    const currentUa = userAgent(request) ?? null;
    const ipMismatch = bindIp && Boolean(stored.ip) && stored.ip !== currentIp;
    const uaMismatch =
      Boolean(stored.userAgent) && Boolean(currentUa) && stored.userAgent !== currentUa;
    if (ipMismatch || uaMismatch) {
      await this.prisma.$transaction([
        this.prisma.refreshToken.updateMany({
          where: { adminId: stored.adminId, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
        this.prisma.admin.update({
          where: { id: stored.adminId },
          data: { tokenVersion: { increment: 1 } },
        }),
      ]);
      await this.audit.record({
        admin: { id: stored.admin.id, name: stored.admin.name, role: "Administrador" },
        action: "auth.refresh.rejected",
        target: stored.admin.email,
        result: "FAILURE",
        metadata: { ipMismatch, uaMismatch },
        request,
      });
      clearAuthCookies(response);
      throw new UnauthorizedException("Sessão revogada. Entre novamente.");
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const user = await this.issueSession(stored.admin, request, response, stored.id);
    return { user };
  }

  async logout(request: Request, response: Response) {
    const token = request.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (token) {
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash: sha256(token), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    clearAuthCookies(response);
    return { ok: true };
  }

  async me(adminId: string): Promise<SessionUser> {
    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
      include: { groups: true, user: true },
    });
    if (
      !admin ||
      admin.status !== "ACTIVE" ||
      (admin.userId && (!admin.user || !this.userIsActive(admin.user)))
    ) {
      throw new UnauthorizedException();
    }
    return {
      name: admin.name,
      email: admin.email,
      role: admin.groups[0]?.name ?? "Administrador",
      permissions: [
        ...new Set(admin.groups.flatMap((group) => group.permissions)),
      ] as Permission[],
      selfService: Boolean(admin.userId),
    };
  }

  private async registerLoginFailure(
    email: string,
    admin: { id: string; name: string; role: string } | undefined,
    request: Request,
  ) {
    const failure = await this.rateLimit.recordAccountFailure(email);
    if (failure.locked) {
      await this.audit.record({
        admin,
        action: "auth.account.locked",
        target: email,
        result: "FAILURE",
        metadata: { attempts: failure.count },
        request,
      });
    }
  }

  private async registerMfaAttempt(challengeId: string) {
    const key = `${MFA_ATTEMPT_PREFIX}${sha256(challengeId)}`;
    const attempts = await this.redis.incr(key);
    if (attempts === 1) {
      await this.redis.expire(key, MFA_ATTEMPT_TTL_SECONDS);
    }
    return attempts;
  }

  private async clearMfaAttempts(challengeId: string) {
    await this.redis.del(`${MFA_ATTEMPT_PREFIX}${sha256(challengeId)}`);
  }

  private verifyNtPassword(password: string, expectedHex: string) {
    const expected = Buffer.from(expectedHex, "hex");
    const actual = Buffer.from(ntPassword(password), "hex");
    return expected.length === actual.length && timingSafeEqual(expected, actual);
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

  private async issueSession(
    admin: {
      id: string;
      name: string;
      email: string;
      userId?: string | null;
      tokenVersion?: number;
      groups: { name: string; permissions: string[] }[];
    },
    request: Request,
    response: Response,
    replacedId?: string,
  ): Promise<SessionUser> {
    const permissions = [
      ...new Set(admin.groups.flatMap((group) => group.permissions)),
    ] as Permission[];
    const role = admin.groups[0]?.name ?? "Administrador";

    // O tempo de sessão configurado é aplicado, mas nunca acima do teto de
    // 15 minutos estabelecido na P0. Valores menores encurtam a sessão.
    const settings = await this.prisma.setting.findUnique({
      where: { id: 1 },
      select: { sessionTimeoutMinutes: true },
    });
    const accessMinutes = Math.min(15, Math.max(5, settings?.sessionTimeoutMinutes ?? 15));

    const accessToken = await this.jwt.signAsync(
      {
        sub: admin.id,
        email: admin.email,
        name: admin.name,
        ver: admin.tokenVersion ?? 0,
      },
      {
        secret: this.config.get<string>("JWT_ACCESS_SECRET"),
        expiresIn: accessMinutes * 60,
        issuer: this.config.get<string>("JWT_ISSUER") ?? "axis-aaa",
        audience: this.config.get<string>("JWT_AUDIENCE") ?? "axis-panel",
        algorithm: "HS256",
        jwtid: randomUUID(),
      },
    );

    const refreshToken = randomToken(48);
    const refreshDays = Number(this.config.get<string>("REFRESH_TTL_DAYS") ?? 7);
    const refreshExpires = new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000);
    await this.prisma.refreshToken.create({
      data: {
        adminId: admin.id,
        tokenHash: sha256(refreshToken),
        expiresAt: refreshExpires,
        ip: clientIp(request),
        userAgent: userAgent(request),
        replacedBy: replacedId,
      },
    });
    await this.prisma.admin.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    const csrfToken = randomToken(24);
    const accessMs = accessMinutes * 60 * 1000;
    setAuthCookies(
      response,
      { accessToken, refreshToken, csrfToken },
      {
        secure: this.config.get<string>("COOKIE_SECURE") === "true",
        accessMaxAgeMs: accessMs,
        refreshMaxAgeMs: refreshDays * 24 * 60 * 60 * 1000,
      },
    );

    return { name: admin.name, email: admin.email, role, permissions, selfService: Boolean(admin.userId) };
  }
}

/** Utilizado pelo bootstrap e por testes. */
export async function hashAdminPassword(password: string): Promise<string> {
  if (password.length < 14) {
    throw new UnprocessableEntityException("A senha deve ter ao menos 14 caracteres.");
  }
  return hash(password, {
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
}
