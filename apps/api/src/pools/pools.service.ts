import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type IpPool } from "@prisma/client";
import type { Request } from "express";
import { PrismaService } from "../common/prisma.service";
import { RadiusService } from "../radius/radius.service";
import { AuditService } from "../common/audit.service";
import { isVpnGroup } from "../common/radius-groups";
import { ipv4Range, ipv4ToNumber, MAX_POOL_ADDRESSES } from "../common/ip";
import type { AdminPrincipal } from "../common/auth.decorators";
import type { AssignIpDto, CreateIpPoolDto } from "./pools.dto";

@Injectable()
export class PoolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly radius: RadiusService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const pools = await this.prisma.ipPool.findMany({ orderBy: { createdAt: "asc" } });
    const assignments = await this.prisma.user.findMany({
      where: { deletedAt: null, framedIpAddress: { not: null } },
      select: { framedIpAddress: true },
    });
    const usedAddresses = new Set(assignments.map((item) => item.framedIpAddress).filter(Boolean) as string[]);
    return pools.map((pool) => {
      const addresses = ipv4Range(pool.startIp, pool.endIp);
      const used = addresses.filter((address) => usedAddresses.has(address)).length;
      return this.toDto(pool, used);
    });
  }

  async addresses(id: string) {
    const pool = await this.findPool(id);
    const assignments = await this.prisma.user.findMany({
      where: { deletedAt: null, framedIpAddress: { not: null } },
      select: { id: true, name: true, login: true, framedIpAddress: true },
    });
    const byAddress = new Map(
      assignments
        .filter((item) => item.framedIpAddress)
        .map((item) => [item.framedIpAddress as string, item]),
    );
    const items = ipv4Range(pool.startIp, pool.endIp).map((address) => {
      const user = byAddress.get(address);
      return {
        address,
        status: user ? ("used" as const) : ("free" as const),
        user: user ? { id: user.id, name: user.name, login: user.login } : null,
      };
    });
    const used = items.filter((item) => item.status === "used").length;
    return {
      pool: this.toDto(pool, used),
      items,
      total: items.length,
      used,
      free: items.length - used,
    };
  }

  async eligibleUsers() {
    const now = new Date();
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        status: "ACTIVE",
        framedIpAddress: null,
        AND: [
          { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
          { OR: [{ validUntil: null }, { validUntil: { gte: now } }] },
        ],
      },
      include: { groups: true },
      orderBy: { name: "asc" },
    });
    return users
      .filter((user) => user.groups.some(isVpnGroup))
      .map((user) => ({
        id: user.id,
        name: user.name,
        login: user.login,
        email: user.email,
        groups: user.groups.filter(isVpnGroup).map((group) => group.name),
      }));
  }

  async create(dto: CreateIpPoolDto, admin: AdminPrincipal, request: Request) {
    const name = dto.name.trim();
    const description = dto.description?.trim() || null;
    const start = ipv4ToNumber(dto.startIp);
    const end = ipv4ToNumber(dto.endIp);
    if (start === null || end === null) {
      throw new BadRequestException("Informe endereços IPv4 válidos.");
    }
    if (end < start) {
      throw new BadRequestException("O IP final deve ser maior ou igual ao inicial.");
    }
    if (end - start + 1 > MAX_POOL_ADDRESSES) {
      throw new BadRequestException(`O pool pode ter no máximo ${MAX_POOL_ADDRESSES} endereços.`);
    }
    const existing = await this.prisma.ipPool.findUnique({ where: { name } });
    if (existing) {
      throw new BadRequestException("Já existe um pool com este nome.");
    }
    const pools = await this.prisma.ipPool.findMany({ select: { name: true, startIp: true, endIp: true } });
    for (const pool of pools) {
      const poolStart = ipv4ToNumber(pool.startIp);
      const poolEnd = ipv4ToNumber(pool.endIp);
      if (poolStart === null || poolEnd === null) continue;
      if (start <= poolEnd && end >= poolStart) {
        throw new BadRequestException(`A faixa se sobrepõe ao pool ${pool.name}.`);
      }
    }

    const pool = await this.prisma.ipPool.create({
      data: { name, description, startIp: dto.startIp, endIp: dto.endIp },
    });
    await this.audit.record({
      admin,
      action: "pool.created",
      target: pool.name,
      request,
      metadata: { startIp: pool.startIp, endIp: pool.endIp, total: end - start + 1 },
    });
    return this.toDto(pool, 0);
  }

  async remove(id: string, admin: AdminPrincipal, request: Request) {
    const pool = await this.findPool(id);
    const used = await this.prisma.user.count({
      where: { ipPoolId: id, deletedAt: null, framedIpAddress: { not: null } },
    });
    if (used > 0) {
      throw new BadRequestException(
        `Libere ${used} endereço(s) antes de excluir este pool.`,
      );
    }
    await this.prisma.ipPool.delete({ where: { id } });
    await this.audit.record({
      admin,
      action: "pool.deleted",
      target: pool.name,
      request,
      metadata: { startIp: pool.startIp, endIp: pool.endIp },
    });
    return { ok: true };
  }

  async assign(id: string, dto: AssignIpDto, admin: AdminPrincipal, request: Request) {
    const pool = await this.findPool(id);
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      include: { groups: true },
    });
    if (!user || user.deletedAt) {
      throw new NotFoundException("Identidade não encontrada.");
    }
    const now = new Date();
    const active =
      user.status === "ACTIVE" &&
      (!user.validFrom || user.validFrom <= now) &&
      (!user.validUntil || user.validUntil >= now);
    if (!active) {
      throw new BadRequestException("A identidade precisa estar ativa e dentro da validade para receber um IP.");
    }
    if (!user.groups.some(isVpnGroup)) {
      throw new BadRequestException(
        "Vincule a identidade a um grupo de VPN antes de atribuir um endereço.",
      );
    }
    if (user.framedIpAddress) {
      throw new BadRequestException(`A identidade já possui o IP ${user.framedIpAddress}.`);
    }

    const addresses = ipv4Range(pool.startIp, pool.endIp);
    if (addresses.length === 0) {
      throw new BadRequestException("O pool não possui endereços válidos.");
    }
    const assigned = await this.prisma.user.findMany({
      where: { deletedAt: null, framedIpAddress: { not: null } },
      select: { framedIpAddress: true },
    });
    const used = new Set(assigned.map((item) => item.framedIpAddress).filter(Boolean) as string[]);
    const requested = dto.address?.trim();
    const address = requested || addresses.find((item) => !used.has(item));
    if (!address) {
      throw new BadRequestException("Não há endereços livres neste pool.");
    }
    if (!addresses.includes(address)) {
      throw new BadRequestException("O endereço não pertence a este pool.");
    }
    if (used.has(address)) {
      throw new BadRequestException("Este endereço já está em uso.");
    }

    let assignedCount = 0;
    try {
      const result = await this.prisma.user.updateMany({
        where: { id: user.id, framedIpAddress: null },
        data: { framedIpAddress: address, ipPoolId: pool.id, ipAssignedAt: new Date() },
      });
      assignedCount = result.count;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new BadRequestException("Este endereço acabou de ser ocupado. Escolha outro.");
      }
      throw error;
    }
    if (assignedCount === 0) {
      throw new BadRequestException("A identidade já possui um IP vinculado.");
    }

    const updated = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { groups: true },
    });
    await this.radius.syncUser(updated);
    await this.audit.record({
      admin,
      action: "pool.address.assigned",
      target: user.login,
      request,
      metadata: { address, pool: pool.name },
    });
    return { address, user: { id: user.id, name: user.name, login: user.login } };
  }

  async release(id: string, userId: string, admin: AdminPrincipal, request: Request) {
    const pool = await this.findPool(id);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { groups: true },
    });
    if (!user || user.deletedAt) {
      throw new NotFoundException("Identidade não encontrada.");
    }
    if (!user.framedIpAddress || user.ipPoolId !== pool.id) {
      throw new BadRequestException("A identidade não possui endereço vinculado a este pool.");
    }
    const address = user.framedIpAddress;
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { framedIpAddress: null, ipPoolId: null, ipAssignedAt: null },
      include: { groups: true },
    });
    await this.radius.syncUser(updated);
    await this.audit.record({
      admin,
      action: "pool.address.released",
      target: user.login,
      request,
      metadata: { address, pool: pool.name },
    });
    return { ok: true, address };
  }

  private async findPool(id: string) {
    const pool = await this.prisma.ipPool.findUnique({ where: { id } });
    if (!pool) throw new NotFoundException("Pool não encontrado.");
    return pool;
  }

  private toDto(pool: IpPool, used: number) {
    const total = ipv4Range(pool.startIp, pool.endIp).length;
    return {
      id: pool.id,
      name: pool.name,
      description: pool.description,
      startIp: pool.startIp,
      endIp: pool.endIp,
      total,
      used,
      free: Math.max(0, total - used),
      createdAt: pool.createdAt.toISOString(),
      updatedAt: pool.updatedAt.toISOString(),
    };
  }
}
