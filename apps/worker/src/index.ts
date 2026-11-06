import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Queue, Worker } from "bullmq";
import Redis from "ioredis";

const prisma = new PrismaClient();
const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
const queue = new Queue("aaa-maintenance", { connection });
const DAY = 24 * 60 * 60 * 1000;

function safeError(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    return `code=${String((error as { code?: unknown }).code ?? "?")}`;
  }
  if (error instanceof Error) return error.name || "Error";
  return "erro desconhecido";
}

async function heartbeat() {
  await connection.set("worker:heartbeat", new Date().toISOString(), "EX", 90);
}

async function syncPresence() {
  await prisma.$executeRaw`
    UPDATE users AS u
    SET "lastAuthAt" = activity.last_auth
    FROM (
      SELECT username, MAX(authdate) AS last_auth
      FROM radpostauth
      GROUP BY username
    ) AS activity
    WHERE u.login = activity.username
      AND (u."lastAuthAt" IS NULL OR u."lastAuthAt" < activity.last_auth)`;

  await prisma.$executeRaw`
    WITH activity AS (
      SELECT host(nasipaddress) AS nas_ip, MAX(last_seen) AS last_seen
      FROM (
        SELECT nasipaddress, acctupdatetime AS last_seen
        FROM radacct
        WHERE acctupdatetime IS NOT NULL
        UNION ALL
        SELECT nasipaddress, authdate AS last_seen
        FROM radpostauth
        WHERE nasipaddress IS NOT NULL
      ) AS events
      GROUP BY host(nasipaddress)
    )
    UPDATE devices AS d
    SET "lastSeenAt" = activity.last_seen,
        status = CASE
          WHEN activity.last_seen > NOW() - INTERVAL '15 minutes' THEN 'ONLINE'::"DeviceStatus"
          ELSE 'OFFLINE'::"DeviceStatus"
        END
    FROM activity
    WHERE d."nasIp" = activity.nas_ip`;

  await prisma.$executeRaw`
    WITH activity AS (
      SELECT host(nasipaddress) AS nas_ip, MAX(last_seen) AS last_seen
      FROM (
        SELECT nasipaddress, acctupdatetime AS last_seen
        FROM radacct
        WHERE acctupdatetime IS NOT NULL
        UNION ALL
        SELECT nasipaddress, authdate AS last_seen
        FROM radpostauth
        WHERE nasipaddress IS NOT NULL
      ) AS events
      GROUP BY host(nasipaddress)
    ),
    aggregate AS (
      SELECT MAX(activity.last_seen) AS last_seen
      FROM activity
      WHERE NOT EXISTS (SELECT 1 FROM devices AS exact WHERE exact."nasIp" = activity.nas_ip)
    )
    UPDATE devices AS d
    SET "lastSeenAt" = aggregate.last_seen,
        status = CASE
          WHEN aggregate.last_seen > NOW() - INTERVAL '15 minutes' THEN 'ONLINE'::"DeviceStatus"
          ELSE 'OFFLINE'::"DeviceStatus"
        END
    FROM aggregate
    WHERE d."nasIp" = '0.0.0.0/0'
      AND aggregate.last_seen IS NOT NULL`;
}

async function cleanup() {
  const settings = await prisma.setting.findUnique({ where: { id: 1 } });
  const sessionDays = settings?.sessionRetentionDays ?? 90;
  const auditDays = settings?.auditRetentionDays ?? 365;

  await prisma.$executeRaw`
    DELETE FROM radacct
    WHERE acctstoptime IS NOT NULL
      AND acctstoptime < NOW() - (${sessionDays} || ' days')::interval`;
  await prisma.$executeRaw`
    DELETE FROM radpostauth
    WHERE authdate < NOW() - (${auditDays} || ' days')::interval`;
}

function safeWebhookUrl(value: string | null | undefined): URL | null {
  if (!value) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "::1" ||
    host.endsWith(".local") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    return null;
  }
  return parsed;
}

async function securityAlerts() {
  const since = new Date(Date.now() - 5 * 60 * 1000);
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const settings = await prisma.setting.findUnique({ where: { id: 1 } });
  const alerts: { type: string; title: string; body: string }[] = [];

  const locks = await prisma.auditEvent.count({
    where: { action: "auth.account.locked", at: { gte: since } },
  });
  if (locks > 0) {
    alerts.push({
      type: "security.alert",
      title: "Alerta: bloqueio de conta por tentativas",
      body: `${locks} conta(s) foram bloqueadas por excesso de falhas nos últimos 5 minutos.`,
    });
  }

  const mfaFails = await prisma.auditEvent.count({
    where: { action: "auth.mfa.failed", at: { gte: since } },
  });
  if (mfaFails >= 3) {
    alerts.push({
      type: "security.alert",
      title: "Alerta: falhas repetidas de MFA",
      body: `${mfaFails} códigos MFA inválidos foram registrados nos últimos 5 minutos.`,
    });
  }

  const rejects = await prisma.$queryRaw<{ target: string; count: bigint }[]>`
    SELECT target, COUNT(*)::bigint AS count
    FROM audit_events
    WHERE action = 'radius.auth.reject' AND at >= ${since}
    GROUP BY target
    HAVING COUNT(*) >= 20
    ORDER BY COUNT(*) DESC
    LIMIT 5`;
  for (const row of rejects) {
    alerts.push({
      type: "security.alert",
      title: `Alerta: rejeições RADIUS para ${row.target}`,
      body: `${Number(row.count)} rejeições RADIUS em 5 minutos para o NAS ${row.target}.`,
    });
  }

  for (const alert of alerts) {
    const exists = await prisma.notification.findFirst({
      where: { title: alert.title, createdAt: { gte: hourAgo } },
    });
    if (exists) continue;
    await prisma.notification.create({ data: alert });

    const webhook = settings?.notificationsWebhook
      ? safeWebhookUrl(settings.webhookUrl)
      : null;
    if (webhook) {
      try {
        await fetch(webhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...alert, at: new Date().toISOString() }),
          signal: AbortSignal.timeout(5000),
        });
      } catch (error) {
        console.error(`[worker] webhook de segurança falhou (${safeError(error)}).`);
      }
    }
  }

  return alerts.length;
}

async function expiringNotifications() {
  const inSevenDays = new Date(Date.now() + 7 * DAY);
  const expiring = await prisma.user.findMany({
    where: {
      deletedAt: null,
      status: "ACTIVE",
      validUntil: { gte: new Date(), lte: inSevenDays },
    },
    select: { login: true, name: true, validUntil: true },
    take: 20,
  });
  for (const user of expiring) {
    const title = `Credencial de ${user.name} expira em breve`;
    const exists = await prisma.notification.findFirst({ where: { title, createdAt: { gte: new Date(Date.now() - DAY) } } });
    if (!exists) {
      await prisma.notification.create({
        data: {
          type: "credential.expiring",
          title,
          body: `${user.login} expira em ${user.validUntil?.toISOString().slice(0, 10)}.`,
        },
      });
    }
  }
}

const worker = new Worker(
  "aaa-maintenance",
  async (job) => {
    await heartbeat();
    if (job.name === "maintenance") {
      await syncPresence();
      await cleanup();
      await expiringNotifications();
      await securityAlerts();
    }
    return { ok: true, at: new Date().toISOString() };
  },
  { connection, concurrency: 1 },
);

worker.on("completed", (job) => console.log(`[worker] ${job.name} concluído`));
worker.on("failed", (job, error) => console.error(`[worker] ${job?.name} falhou (${safeError(error)}).`));

async function main() {
  await queue.add("maintenance", {}, { repeat: { every: 60_000 }, jobId: "maintenance" });
  await heartbeat();
  console.log("[worker] ativo, fila aaa-maintenance, intervalo de 60s");
}

async function shutdown() {
  await worker.close();
  await queue.close();
  await connection.quit();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

if (process.env.WORKER_ONCE === "security-alerts") {
  securityAlerts()
    .then(async (count) => {
      console.log(`[worker] security-alerts: ${count} alerta(s) novo(s)`);
      await worker.close();
      await queue.close();
      await connection.quit();
      await prisma.$disconnect();
      process.exit(0);
    })
    .catch((error) => {
      console.error(`[worker] security-alerts falhou (${safeError(error)}).`);
      process.exit(1);
    });
} else {
  main().catch((error) => {
    console.error(`[worker] falhou (${safeError(error)}).`);
    process.exit(1);
  });
}
