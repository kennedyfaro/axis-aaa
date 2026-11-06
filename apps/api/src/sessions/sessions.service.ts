import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../common/prisma.service";
import { RadiusService } from "../radius/radius.service";
import { CoaService } from "../radius/coa.service";

interface RevokeRow {
  radacctid: bigint;
  acctsessionid: string;
  username: string;
  nasipaddress: string;
  framedipaddress: string | null;
  acctstoptime: Date | null;
  nasidentifier: string | null;
}

interface RadacctRow {
  radacctid: bigint;
  acctsessionid: string;
  username: string;
  nasipaddress: string;
  framedipaddress: string | null;
  acctstarttime: Date | null;
  acctstoptime: Date | null;
  acctsessiontime: bigint | null;
  acctinputoctets: bigint | null;
  acctoutputoctets: bigint | null;
  acctterminatecause: string | null;
  nasidentifier: string | null;
}

export interface SessionDto {
  id: string;
  userId: string;
  userName: string;
  userLogin: string;
  deviceId: string;
  deviceName: string;
  nasIdentifier: string | null;
  nasIp: string;
  assignedIp: string | null;
  protocol: "radius";
  startedAt: string;
  endedAt: string | null;
  status: "active" | "closed";
  bytesIn: number;
  bytesOut: number;
  mfa: boolean;
  terminateCause: string | null;
}

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly radius: RadiusService,
    private readonly coa: CoaService,
  ) {}

  async list(params: { status?: string; query?: string }): Promise<SessionDto[]> {
    const status = params.status ?? "all";
    const query = (params.query ?? "").trim();
    const rows = await this.prisma.$queryRaw<RadacctRow[]>`
      SELECT r.radacctid, r.acctsessionid, r.username, host(r.nasipaddress) AS nasipaddress,
             r.framedipaddress, r.acctstarttime, r.acctstoptime, r.acctsessiontime,
             r.acctinputoctets, r.acctoutputoctets, r.acctterminatecause,
             ni.nasidentifier
      FROM radacct r
      LEFT JOIN (
        SELECT DISTINCT ON (p.nasipaddress) p.nasipaddress, p.nasidentifier
        FROM radpostauth p
        WHERE p.nasidentifier IS NOT NULL AND p.nasidentifier <> ''
        ORDER BY p.nasipaddress, p.authdate DESC
      ) ni ON ni.nasipaddress = r.nasipaddress
      WHERE (${status} = 'all'
             OR (${status} = 'active' AND r.acctstoptime IS NULL)
             OR (${status} = 'closed' AND r.acctstoptime IS NOT NULL))
        AND (${query} = ''
             OR r.username ILIKE ${`%${query}%`}
             OR host(r.nasipaddress) ILIKE ${`%${query}%`}
             OR r.framedipaddress ILIKE ${`%${query}%`}
             OR ni.nasidentifier ILIKE ${`%${query}%`})
      ORDER BY r.acctstarttime DESC NULLS LAST
      LIMIT 300`;
    return this.mapRows(rows);
  }

  async listForUser(login: string): Promise<SessionDto[]> {
    const rows = await this.prisma.$queryRaw<RadacctRow[]>`
      SELECT r.radacctid, r.acctsessionid, r.username, host(r.nasipaddress) AS nasipaddress,
             r.framedipaddress, r.acctstarttime, r.acctstoptime, r.acctsessiontime,
             r.acctinputoctets, r.acctoutputoctets, r.acctterminatecause,
             ni.nasidentifier
      FROM radacct r
      LEFT JOIN (
        SELECT DISTINCT ON (p.nasipaddress) p.nasipaddress, p.nasidentifier
        FROM radpostauth p
        WHERE p.nasidentifier IS NOT NULL AND p.nasidentifier <> ''
        ORDER BY p.nasipaddress, p.authdate DESC
      ) ni ON ni.nasipaddress = r.nasipaddress
      WHERE r.username = ${login}
      ORDER BY r.acctstarttime DESC NULLS LAST
      LIMIT 50`;
    return this.mapRows(rows);
  }

  async activeCount(): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM radacct WHERE acctstoptime IS NULL`;
    return Number(rows[0]?.count ?? 0);
  }

  async revoke(id: string, expectedLogin?: string) {
    if (!/^\d+$/.test(id)) {
      return {
        revoked: false,
        disconnected: false,
        coaStatus: "none",
        message: "Sessão inválida.",
      };
    }
    const rows = await this.prisma.$queryRaw<RevokeRow[]>`
      SELECT r.radacctid, r.acctsessionid, r.username, host(r.nasipaddress) AS nasipaddress,
             r.framedipaddress, r.acctstoptime, ni.nasidentifier
      FROM radacct r
      LEFT JOIN (
        SELECT DISTINCT ON (p.nasipaddress) p.nasipaddress, p.nasidentifier
        FROM radpostauth p
        WHERE p.nasidentifier IS NOT NULL AND p.nasidentifier <> ''
        ORDER BY p.nasipaddress, p.authdate DESC
      ) ni ON ni.nasipaddress = r.nasipaddress
      WHERE r.radacctid = ${BigInt(id)}`;
    const row = rows[0];
    if (!row || (expectedLogin && row.username !== expectedLogin)) {
      return {
        revoked: false,
        disconnected: false,
        coaStatus: "none",
        message: "Sessão não encontrada.",
      };
    }
    if (row.acctstoptime) {
      return {
        revoked: false,
        disconnected: false,
        coaStatus: "none",
        username: row.username,
        message: "Sessão já encerrada.",
      };
    }

    const coa = await this.coa.disconnect({
      username: row.username,
      acctSessionId: row.acctsessionid,
      nasIp: row.nasipaddress,
      nasIdentifier: row.nasidentifier,
      framedIpAddress: row.framedipaddress,
    });
    const changed = await this.radius.revokeSession(row.radacctid);
    const revoked = changed > 0 || coa.disconnected;

    return {
      revoked,
      disconnected: coa.disconnected,
      coaStatus: coa.status,
      username: row.username,
      message: this.revokeMessage(coa.message, coa.status, changed > 0),
    };
  }

  async revokeAllForUser(login: string) {
    const rows = await this.prisma.$queryRaw<RevokeRow[]>`
      SELECT r.radacctid, r.acctsessionid, r.username, host(r.nasipaddress) AS nasipaddress,
             r.framedipaddress, r.acctstoptime, ni.nasidentifier
      FROM radacct r
      LEFT JOIN (
        SELECT DISTINCT ON (p.nasipaddress) p.nasipaddress, p.nasidentifier
        FROM radpostauth p
        WHERE p.nasidentifier IS NOT NULL AND p.nasidentifier <> ''
        ORDER BY p.nasipaddress, p.authdate DESC
      ) ni ON ni.nasipaddress = r.nasipaddress
      WHERE r.username = ${login} AND r.acctstoptime IS NULL`;

    let disconnected = 0;
    await Promise.all(
      rows.map(async (row) => {
        const coa = await this.coa.disconnect({
          username: row.username,
          acctSessionId: row.acctsessionid,
          nasIp: row.nasipaddress,
          nasIdentifier: row.nasidentifier,
          framedIpAddress: row.framedipaddress,
        });
        if (coa.disconnected) disconnected += 1;
        await this.radius.revokeSession(row.radacctid);
      }),
    );

    return { revoked: rows.length, disconnected };
  }

  private revokeMessage(message: string, status: string, accountingClosed: boolean) {
    if (status === "ack") {
      return "Sessão desconectada no NAS e encerrada no accounting.";
    }
    const fallback = accountingClosed
      ? "Sessão encerrada apenas no accounting."
      : "A sessão já não estava ativa no accounting.";
    return `${message} ${fallback}`;
  }

  private async mapRows(rows: RadacctRow[]): Promise<SessionDto[]> {
    const logins = [...new Set(rows.map((row) => row.username))];
    const ips = [...new Set(rows.map((row) => row.nasipaddress))];
    const users = await this.prisma.user.findMany({
      where: { login: { in: logins } },
      select: { id: true, login: true, name: true, mfa: true },
    });
    const [devices, defaultDevice] = await Promise.all([
      this.prisma.device.findMany({
        where: { nasIp: { in: ips } },
        select: { id: true, name: true, nasIp: true },
      }),
      this.prisma.device.findFirst({
        where: { nasIp: "0.0.0.0/0" },
        select: { id: true, name: true, nasIp: true },
      }),
    ]);
    const userByLogin = new Map(users.map((user) => [user.login, user]));
    const deviceByIp = new Map(devices.map((device) => [device.nasIp, device]));

    return rows.map((row) => {
      const user = userByLogin.get(row.username);
      const device = deviceByIp.get(row.nasipaddress) ?? defaultDevice ?? undefined;
      const started = row.acctstarttime ?? new Date();
      return {
        id: String(row.radacctid),
        userId: user?.id ?? `unknown-${row.username}`,
        userName: user?.name ?? row.username,
        userLogin: row.username,
        deviceId: device?.id ?? `unknown-${row.nasipaddress}`,
        deviceName: device?.name ?? row.nasipaddress,
        nasIdentifier: row.nasidentifier?.trim() || null,
        nasIp: row.nasipaddress,
        assignedIp: row.framedipaddress?.replace(/\/\d+$/, "") || null,
        protocol: "radius",
        startedAt: started.toISOString(),
        endedAt: row.acctstoptime?.toISOString() ?? null,
        status: row.acctstoptime ? "closed" : "active",
        bytesIn: Number(row.acctinputoctets ?? 0),
        bytesOut: Number(row.acctoutputoctets ?? 0),
        mfa: user?.mfa ?? false,
        terminateCause: row.acctterminatecause || null,
      };
    });
  }
}
