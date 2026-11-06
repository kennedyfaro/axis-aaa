import { Inject, Injectable } from "@nestjs/common";
import Redis from "ioredis";
import { PrismaService } from "../common/prisma.service";
import { REDIS } from "../common/redis.module";

@Injectable()
export class HealthService {
  private cached: Awaited<ReturnType<HealthService["check"]>> | null = null;
  private cachedAt = 0;
  private readonly cacheTtlMs = 10_000;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async summary() {
    if (!this.cached || Date.now() - this.cachedAt > this.cacheTtlMs) {
      this.cached = await this.check();
      this.cachedAt = Date.now();
    }
    const full = this.cached;
    return {
      status: full.services.every((service) => service.status === "operational")
        ? "ok"
        : "degraded",
      checkedAt: full.checkedAt,
      services: full.services.map(({ id, name, status }) => ({ id, name, status })),
    };
  }

  async check() {
    const services: {
      id: string;
      name: string;
      status: "operational" | "degraded" | "down";
      latencyMs: number | null;
      version: string;
      detail: string;
    }[] = [];

    const apiStart = Date.now();
    services.push({
      id: "api",
      name: "API",
      status: "operational",
      latencyMs: Date.now() - apiStart,
      version: "0.1.0",
      detail: "NestJS / Node.js",
    });

    try {
      const start = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      services.push({
        id: "postgres",
        name: "PostgreSQL",
        status: "operational",
        latencyMs: Date.now() - start,
        version: "17",
        detail: "Conexão Prisma ativa",
      });
    } catch {
      services.push({
        id: "postgres",
        name: "PostgreSQL",
        status: "down",
        latencyMs: null,
        version: "17",
        detail: "Sem conexão",
      });
    }

    try {
      const start = Date.now();
      await this.redis.ping();
      services.push({
        id: "redis",
        name: "Redis",
        status: "operational",
        latencyMs: Date.now() - start,
        version: "8",
        detail: "Filas, rate limit e desafios MFA",
      });
    } catch {
      services.push({
        id: "redis",
        name: "Redis",
        status: "down",
        latencyMs: null,
        version: "8",
        detail: "Sem conexão",
      });
    }

    try {
      const rows = await this.prisma.$queryRaw<{ last: Date | null; total: bigint }[]>`
        SELECT MAX(authdate) AS last, COUNT(*)::bigint AS total FROM radpostauth`;
      const last = rows[0]?.last;
      services.push({
        id: "radius",
        name: "FreeRADIUS",
        status: "operational",
        latencyMs: null,
        version: "3.2.8",
        detail: last
          ? `Última autenticação em ${last.toISOString()}`
          : `Sem autenticações registradas (${Number(rows[0]?.total ?? 0)} eventos)`,
      });
    } catch {
      services.push({
        id: "radius",
        name: "FreeRADIUS",
        status: "down",
        latencyMs: null,
        version: "3.2.8",
        detail: "Tabelas RADIUS inacessíveis",
      });
    }

    try {
      const heartbeat = await this.redis.get("worker:heartbeat");
      services.push({
        id: "worker",
        name: "Worker",
        status: heartbeat ? "operational" : "degraded",
        latencyMs: null,
        version: "0.1.0",
        detail: heartbeat ? `Heartbeat ${new Date(heartbeat).toISOString()}` : "Sem heartbeat recente",
      });
    } catch {
      services.push({
        id: "worker",
        name: "Worker",
        status: "down",
        latencyMs: null,
        version: "0.1.0",
        detail: "Redis indisponível",
      });
    }

    return {
      mode: process.env.NODE_ENV === "production" ? "production" : "development",
      checkedAt: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      services,
    };
  }
}
