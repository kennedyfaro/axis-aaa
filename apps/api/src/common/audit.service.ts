import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Request } from "express";
import { PrismaService } from "./prisma.service";
import { csvRows } from "./csv";
import { errorSummary } from "./error";
import { clientIp, requestId } from "./request";
import type { AdminPrincipal } from "./auth.decorators";

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: {
    admin?: Pick<AdminPrincipal, "id" | "name" | "role">;
    action: string;
    target: string;
    result?: "SUCCESS" | "FAILURE";
    metadata?: Record<string, string | number | boolean> | null;
    request: Request;
  }) {
    const base = {
      adminId: input.admin?.id,
      actor: input.admin?.name ?? "sistema",
      actorRole: input.admin?.role ?? "RADIUS",
      action: input.action,
      target: input.target.slice(0, 180),
      result: input.result ?? "SUCCESS",
      ip: clientIp(input.request),
      metadata: input.metadata ?? undefined,
    };

    // O ID é gerado pelo servidor. Ainda assim, tentamos novamente com um
    // novo ID em caso de colisão para não perder o evento.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.auditEvent.create({
          data: { ...base, requestId: requestId(input.request) },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002" &&
          attempt < 2
        ) {
          continue;
        }
        // A ação já pode ter sido concluída; não devolvemos 500 por falha
        // de auditoria, mas registramos a falha no log do servidor.
        this.logger.error(
          `Falha ao registrar auditoria ${input.action} em ${base.target} (${errorSummary(error)}).`,
        );
        return null;
      }
    }
    return null;
  }

  async findForTarget(target: string) {
    const events = await this.prisma.auditEvent.findMany({
      where: { target },
      orderBy: { at: "desc" },
      take: 12,
    });
    return events.map((event) => this.toDto(event));
  }

  async list(params: { query?: string; result?: string; period?: string }) {
    const period = params.period ?? "7d";
    const days = period === "24h" ? 1 : period === "30d" ? 30 : 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const query = (params.query ?? "").trim();
    const where: Prisma.AuditEventWhereInput = {
      at: { gte: since },
      ...(params.result && params.result !== "all"
        ? { result: params.result.toUpperCase() as "SUCCESS" | "FAILURE" }
        : {}),
      ...(query
        ? {
            OR: [
              { actor: { contains: query, mode: "insensitive" } },
              { action: { contains: query, mode: "insensitive" } },
              { target: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const events = await this.prisma.auditEvent.findMany({
      where,
      orderBy: { at: "desc" },
      take: 500,
    });
    return events.map((event) => this.toDto(event));
  }

  async exportCsv(events: Awaited<ReturnType<AuditService["list"]>>) {
    const header = ["data", "ator", "perfil", "acao", "alvo", "resultado", "ip", "request_id"];
    const rows = events.map((event) => [
      event.at,
      event.actor,
      event.actorRole,
      event.action,
      event.target,
      event.result,
      event.ip,
      event.requestId,
    ]);
    return csvRows(header, rows);
  }

  private toDto(event: {
    id: string;
    at: Date;
    actor: string;
    actorRole: string;
    action: string;
    target: string;
    result: string;
    ip: string;
    requestId: string;
    metadata: Prisma.JsonValue;
  }) {
    return {
      id: event.id,
      at: event.at.toISOString(),
      actor: event.actor,
      actorRole: event.actorRole,
      action: event.action,
      target: event.target,
      result: event.result.toLowerCase(),
      ip: event.ip,
      requestId: event.requestId,
      metadata: event.metadata as Record<string, string | number | boolean> | null,
    };
  }
}
