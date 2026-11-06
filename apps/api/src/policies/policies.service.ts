import { Injectable, NotFoundException } from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";
import type { AdminPrincipal } from "../common/auth.decorators";
import type { CreatePolicyDto } from "./policies.dto";

@Injectable()
export class PoliciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const policies = await this.prisma.policy.findMany({ orderBy: { priority: "asc" } });
    return policies.map((policy) => this.toDto(policy));
  }

  async create(dto: CreatePolicyDto, admin: AdminPrincipal, request: Request) {
    const policy = await this.prisma.policy.create({
      data: {
        name: dto.name,
        description: dto.description,
        scope: dto.scope.toUpperCase() as "IDENTITY" | "DEVICE" | "SESSION",
        action: dto.action.toUpperCase() as "ALLOW" | "DENY" | "CHALLENGE",
        priority: dto.priority,
        conditions: dto.conditions ?? [],
      },
    });
    await this.audit.record({
      admin,
      action: "policy.created",
      target: policy.name,
      request,
      metadata: { scope: policy.scope, action: policy.action },
    });
    return this.toDto(policy);
  }

  async toggle(id: string, enabled: boolean, admin: AdminPrincipal, request: Request) {
    const policy = await this.prisma.policy.update({ where: { id }, data: { enabled } }).catch(() => null);
    if (!policy) throw new NotFoundException("Política não encontrada.");
    await this.audit.record({
      admin,
      action: "policy.updated",
      target: policy.name,
      request,
      metadata: { enabled },
    });
    return this.toDto(policy);
  }

  private toDto(policy: {
    id: string;
    name: string;
    description: string;
    scope: string;
    conditions: unknown;
    action: string;
    priority: number;
    enabled: boolean;
    updatedAt: Date;
  }) {
    return {
      id: policy.id,
      name: policy.name,
      description: policy.description,
      scope: policy.scope.toLowerCase(),
      conditions: policy.conditions,
      action: policy.action.toLowerCase(),
      priority: policy.priority,
      enabled: policy.enabled,
      updatedAt: policy.updatedAt.toISOString(),
    };
  }
}
