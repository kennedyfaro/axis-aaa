import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, type Group, type User } from "@prisma/client";
import { PrismaService } from "../common/prisma.service";
import { decryptSecret } from "../common/crypto";
import { errorSummary } from "../common/error";
import { radiusExpiration } from "./expiration";

type RadiusUser = User & { groups: Group[] };

@Injectable()
export class RadiusService implements OnModuleInit {
  private readonly logger = new Logger(RadiusService.name);
  private readonly encryptionKey: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.encryptionKey = config.get<string>("ENCRYPTION_KEY") ?? "";
  }

  async onModuleInit() {
    try {
      await this.syncAll();
    } catch (error) {
      this.logger.warn(`Sincronização RADIUS inicial adiada (${errorSummary(error)}).`);
    }
  }

  async syncAll() {
    const groups = await this.prisma.group.findMany();
    const users = await this.prisma.user.findMany({ include: { groups: true } });
    const devices = await this.prisma.device.findMany();
    for (const group of groups) {
      if (group.radiusGroupName) await this.syncGroup(group);
    }
    for (const user of users) await this.syncUser(user);
    for (const device of devices) await this.syncDevice(device);
    const radiusGroups = groups.filter((group) => group.radiusGroupName).length;
    this.logger.log(
      `RADIUS sincronizado: ${users.length} identidades, ${radiusGroups} grupos, ${devices.length} NAS.`,
    );
  }

  async syncUser(userOrId: RadiusUser | string) {
    const user =
      typeof userOrId === "string"
        ? await this.prisma.user.findUnique({ where: { id: userOrId }, include: { groups: true } })
        : userOrId;
    if (!user) return;

    const now = new Date();
    const validFrom = !user.validFrom || user.validFrom <= now;
    const validUntil = !user.validUntil || user.validUntil >= now;
    const active = user.status === "ACTIVE" && !user.deletedAt && validFrom && validUntil;

    await this.prisma.$transaction([
      this.prisma.$executeRaw`DELETE FROM radcheck WHERE username = ${user.login}`,
      this.prisma.$executeRaw`DELETE FROM radreply WHERE username = ${user.login}`,
      this.prisma.$executeRaw`DELETE FROM radusergroup WHERE username = ${user.login}`,
    ]);

    if (!active || !user.radiusNtHash) {
      await this.prisma.$executeRaw`
        INSERT INTO radcheck (username, attribute, op, value)
        VALUES (${user.login}, 'Auth-Type', ':=', 'Reject')`;
      const reason = user.deletedAt
        ? "Identidade removida"
        : user.status === "BLOCKED"
          ? "Conta bloqueada"
          : "Credencial expirada";
      await this.prisma.$executeRaw`
        INSERT INTO radreply (username, attribute, op, value)
        VALUES (${user.login}, 'Reply-Message', '=', ${reason})`;
      return;
    }

    await this.prisma.$executeRaw`
      INSERT INTO radcheck (username, attribute, op, value)
      VALUES (${user.login}, 'NT-Password', ':=', ${user.radiusNtHash})`;

    // O módulo `expiration` do FreeRADIUS verifica este atributo a cada
    // autenticação. Sem ele, uma identidade expirada continuaria válida
    // até o próximo restart/sync da API.
    if (user.validUntil) {
      await this.prisma.$executeRaw`
        INSERT INTO radcheck (username, attribute, op, value)
        VALUES (${user.login}, 'Expiration', ':=', ${radiusExpiration(user.validUntil)})`;
    }

    if (user.framedIpAddress) {
      await this.prisma.$executeRaw`
        INSERT INTO radreply (username, attribute, op, value)
        VALUES (${user.login}, 'Framed-IP-Address', '=', ${user.framedIpAddress})`;
    }

    const radiusGroups = user.groups.filter((group) => group.radiusGroupName);
    for (const group of radiusGroups) {
      await this.prisma.$executeRaw`
        INSERT INTO radusergroup (username, groupname, priority)
        VALUES (${user.login}, ${group.radiusGroupName}, 1)`;
      await this.syncGroup(group);
    }
  }

  async syncGroup(group: Group) {
    if (!group.radiusGroupName) return;
    await this.prisma.$executeRaw`DELETE FROM radgroupreply WHERE groupname = ${group.radiusGroupName}`;
    await this.prisma.$executeRaw`DELETE FROM radgroupcheck WHERE groupname = ${group.radiusGroupName}`;
    const attributes = (group.radiusAttributes ?? {}) as Record<string, string | number>;
    for (const [attribute, value] of Object.entries(attributes)) {
      await this.prisma.$executeRaw`
        INSERT INTO radgroupreply (groupname, attribute, op, value)
        VALUES (${group.radiusGroupName}, ${attribute}, '=', ${String(value)})`;
    }
  }

  async syncDevice(deviceOrId: {
    id: string;
    name: string;
    nasIp: string;
    nasIdentifier: string;
    description: string;
    secretCipher: string;
  } | string) {
    const device = typeof deviceOrId === "string"
      ? await this.prisma.device.findUnique({ where: { id: deviceOrId } })
      : deviceOrId;
    if (!device) return;

    const secret = decryptSecret(device.secretCipher, this.encryptionKey);
    await this.prisma.$executeRaw`DELETE FROM nas WHERE shortname = ${device.nasIdentifier}`;
    await this.prisma.$executeRaw`
      INSERT INTO nas (nasname, shortname, type, secret, description)
      VALUES (${device.nasIp}, ${device.nasIdentifier}, 'other', ${secret}, ${device.description})`;
  }

  async removeDevice(nasIdentifier: string) {
    await this.prisma.$executeRaw`DELETE FROM nas WHERE shortname = ${nasIdentifier}`;
  }

  async removeUser(login: string) {
    await this.prisma.$transaction([
      this.prisma.$executeRaw`DELETE FROM radcheck WHERE username = ${login}`,
      this.prisma.$executeRaw`DELETE FROM radreply WHERE username = ${login}`,
      this.prisma.$executeRaw`DELETE FROM radusergroup WHERE username = ${login}`,
    ]);
    await this.revokeUserSessions(login);
  }

  async revokeUserSessions(login: string): Promise<number> {
    return this.prisma.$executeRaw`
      UPDATE radacct
      SET acctstoptime = NOW(),
          acctupdatetime = NOW(),
          acctterminatecause = 'Admin-Reset',
          acctsessiontime = EXTRACT(EPOCH FROM (NOW() - COALESCE(acctstarttime, NOW())))::bigint
      WHERE username = ${login} AND acctstoptime IS NULL`;
  }

  async revokeSession(radacctid: bigint): Promise<number> {
    return this.prisma.$executeRaw`
      UPDATE radacct
      SET acctstoptime = NOW(),
          acctupdatetime = NOW(),
          acctterminatecause = 'Admin-Reset',
          acctsessiontime = EXTRACT(EPOCH FROM (NOW() - COALESCE(acctstarttime, NOW())))::bigint
      WHERE radacctid = ${radacctid} AND acctstoptime IS NULL`;
  }

  async recentActivity(): Promise<Date | null> {
    const rows = await this.prisma.$queryRaw<{ last: Date | null }[]>`
      SELECT MAX(authdate) AS last FROM radpostauth`;
    return rows[0]?.last ?? null;
  }

  async countRejectedSince(since: Date): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM radpostauth
      WHERE reply LIKE 'Access-Reject%' AND authdate >= ${since}`;
    return Number(rows[0]?.count ?? 0);
  }
}

export type { RadiusUser };
