import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";
import { RadiusService } from "../radius/radius.service";
import type { AdminPrincipal } from "../common/auth.decorators";
import type { UpdateGroupDto } from "./groups.dto";
import { assertAllowedRadiusAttribute } from "./radius-attributes";

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly radius: RadiusService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const groups = await this.prisma.group.findMany({
      include: { _count: { select: { users: { where: { deletedAt: null } } } } },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
    });
    return groups.map((group) => this.toDto(group, group._count.users));
  }

  async update(id: string, dto: UpdateGroupDto, admin: AdminPrincipal, request: Request) {
    const group = await this.prisma.group.findUnique({ where: { id } });
    if (!group) throw new NotFoundException("Grupo não encontrado.");

    const attributes = dto.radiusAttributes ?? {};
    for (const [attribute, value] of Object.entries(attributes)) {
      if (!/^[A-Za-z0-9._-]{1,64}$/.test(attribute)) {
        throw new BadRequestException(`Atributo inválido: ${attribute}.`);
      }
      try {
        assertAllowedRadiusAttribute(attribute);
      } catch (error) {
        throw new BadRequestException((error as Error).message);
      }
      if (
        typeof value !== "string" ||
        value.length === 0 ||
        value.length > 253 ||
        /[\r\n\0]/.test(value)
      ) {
        throw new BadRequestException(`Valor inválido para o atributo ${attribute}.`);
      }
    }

    const hasAttributes = Object.keys(attributes).length > 0;
    const radiusGroupName = group.radiusGroupName ?? (hasAttributes ? group.slug : null);

    const updated = await this.prisma.group.update({
      where: { id },
      data: { radiusAttributes: attributes, radiusGroupName },
      include: { _count: { select: { users: { where: { deletedAt: null } } } } },
    });

    if (updated.radiusGroupName) {
      await this.radius.syncGroup(updated);
      if (!group.radiusGroupName) {
        const users = await this.prisma.user.findMany({
          where: { groups: { some: { id } } },
          include: { groups: true },
        });
        for (const user of users) await this.radius.syncUser(user);
      }
    }

    await this.audit.record({
      admin,
      action: "group.updated",
      target: updated.name,
      request,
      metadata: {
        attributes: Object.keys(attributes).length,
        radiusGroupName: updated.radiusGroupName ?? "",
      },
    });

    return this.toDto(updated, updated._count.users);
  }

  private toDto(
    group: {
      id: string;
      name: string;
      slug: string;
      description: string;
      kind: string;
      permissions: string[];
      radiusGroupName: string | null;
      radiusAttributes: unknown;
    },
    memberCount: number,
  ) {
    return {
      id: group.id,
      name: group.name,
      slug: group.slug,
      description: group.description,
      kind: group.kind.toLowerCase(),
      memberCount,
      permissions: group.permissions,
      radiusGroupName: group.radiusGroupName,
      radiusAttributes: (group.radiusAttributes ?? null) as Record<string, string> | null,
    };
  }
}
