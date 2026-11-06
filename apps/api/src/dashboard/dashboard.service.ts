import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary() {
    const dayAgo = new Date(Date.now() - DAY);
    const in14Days = new Date(Date.now() + 14 * DAY);
    const [activeUsers, blockedUsers, pendingUsers, devicesTotal, devicesOnline, expiringSoon, mfaUsers, auth, sessions] =
      await Promise.all([
        this.prisma.user.count({ where: { status: "ACTIVE", deletedAt: null } }),
        this.prisma.user.count({ where: { status: "BLOCKED", deletedAt: null } }),
        this.prisma.user.count({ where: { status: "PENDING", deletedAt: null } }),
        this.prisma.device.count(),
        this.prisma.device.count({ where: { status: "ONLINE" } }),
        this.prisma.user.count({
          where: {
            status: "ACTIVE",
            deletedAt: null,
            validUntil: { gte: new Date(), lte: in14Days },
          },
        }),
        this.prisma.user.count({ where: { status: "ACTIVE", deletedAt: null, mfa: true } }),
        this.prisma.$queryRaw<{ accepted: bigint; rejected: bigint }[]>`
          SELECT
            COUNT(*) FILTER (WHERE reply = 'Access-Accept')::bigint AS accepted,
            COUNT(*) FILTER (WHERE reply LIKE 'Access-Reject%')::bigint AS rejected
          FROM radpostauth WHERE authdate >= ${dayAgo}`,
        this.prisma.$queryRaw<{ count: bigint }[]>`
          SELECT COUNT(*)::bigint AS count FROM radacct WHERE acctstoptime IS NULL`,
      ]);

    const accepted = Number(auth[0]?.accepted ?? 0);
    const rejected = Number(auth[0]?.rejected ?? 0);
    const total = accepted + rejected;

    return {
      activeUsers,
      blockedUsers,
      pendingUsers,
      authAccepted24h: accepted,
      authRejected24h: rejected,
      successRate: total === 0 ? 100 : Number(((accepted / total) * 100).toFixed(1)),
      activeSessions: Number(sessions[0]?.count ?? 0),
      devicesOnline,
      devicesTotal,
      mfaCoverage: activeUsers === 0 ? 0 : Number(((mfaUsers / activeUsers) * 100).toFixed(1)),
      expiringSoon,
      lastSyncAt: new Date().toISOString(),
    };
  }

  async series(range: string) {
    const normalized = range === "7d" || range === "30d" ? range : "24h";
    const points = normalized === "24h" ? 24 : normalized === "7d" ? 7 : 30;
    const step = normalized === "24h" ? HOUR : DAY;
    const end = Date.now();
    const start = end - points * step;

    const rows = await this.prisma.$queryRaw<{ authdate: Date; reply: string }[]>`
      SELECT authdate, reply FROM radpostauth
      WHERE authdate >= ${new Date(start)}
      ORDER BY authdate ASC`;

    const buckets = Array.from({ length: points }, () => ({ accepted: 0, rejected: 0 }));
    for (const row of rows) {
      const index = Math.min(points - 1, Math.max(0, Math.floor((row.authdate.getTime() - start) / step)));
      if (row.reply === "Access-Accept") buckets[index].accepted += 1;
      else if (row.reply.startsWith("Access-Reject")) buckets[index].rejected += 1;
    }

    return {
      range: normalized,
      points: buckets.map((bucket, index) => ({
        t: new Date(start + index * step).toISOString(),
        ...bucket,
      })),
    };
  }
}
