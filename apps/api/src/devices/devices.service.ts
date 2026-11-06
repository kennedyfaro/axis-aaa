import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { PrismaService } from "../common/prisma.service";
import { RadiusService } from "../radius/radius.service";
import { AuditService } from "../common/audit.service";
import { encryptSecret, randomToken } from "../common/crypto";
import type { AdminPrincipal } from "../common/auth.decorators";
import type { CreateDeviceDto, RotateDeviceSecretDto, UpdateDeviceDto } from "./devices.dto";

@Injectable()
export class DevicesService {
  private readonly encryptionKey: string;
  private readonly allowWildcardNas: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly radius: RadiusService,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.encryptionKey = config.get<string>("ENCRYPTION_KEY") ?? "";
    this.allowWildcardNas = config.get<string>("RADIUS_ALLOW_WILDCARD_NAS") === "true";
  }

  async list() {
    const devices = await this.prisma.device.findMany({
      include: { authorizedGroups: true },
      orderBy: { name: "asc" },
    });
    return devices.map((device) => this.toDto(device));
  }

  async create(dto: CreateDeviceDto, admin: AdminPrincipal, request: Request) {
    if (dto.ip === "0.0.0.0/0" && !this.allowWildcardNas) {
      throw new BadRequestException(
        "NAS curinga 0.0.0.0/0 desabilitado. Cadastre o IP exato do equipamento.",
      );
    }

    const existingIp = await this.prisma.device.findFirst({
      where: { nasIp: dto.ip },
      select: { id: true },
    });
    if (existingIp) {
      throw new BadRequestException("Já existe um NAS cadastrado com este IP.");
    }

    const groups = await this.prisma.group.count({ where: { id: { in: dto.authorizedGroupIds } } });
    if (groups !== new Set(dto.authorizedGroupIds).size) {
      throw new BadRequestException("Um ou mais grupos não existem.");
    }

    const secret = dto.secret ?? randomToken(18);
    const device = await this.prisma.device.create({
      data: {
        name: dto.name,
        description: dto.description,
        vendor: dto.vendor.toUpperCase() as "MIKROTIK",
        model: dto.model,
        kind: dto.kind.toUpperCase().replace("-", "_") as "WIRELESS_CONTROLLER",
        ip: dto.ip,
        nasIdentifier: dto.nasIdentifier,
        nasIp: dto.ip,
        site: dto.site,
        environment: dto.environment.toUpperCase() as "PRODUCTION",
        status: "PENDING",
        secretCipher: encryptSecret(secret, this.encryptionKey),
        authorizedGroups: { connect: dto.authorizedGroupIds.map((id) => ({ id })) },
      },
      include: { authorizedGroups: true },
    });
    await this.radius.syncDevice(device);
    await this.audit.record({
      admin,
      action: "device.created",
      target: device.name,
      request,
      metadata: { vendor: device.vendor, nasIp: device.nasIp },
    });
    return { ...this.toDto(device), secret };
  }

  async rotateSecret(id: string, dto: RotateDeviceSecretDto, admin: AdminPrincipal, request: Request) {
    const current = await this.prisma.device.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("Equipamento não encontrado.");
    const secret = dto?.secret ?? randomToken(18);
    const device = await this.prisma.device.update({
      where: { id },
      data: { secretCipher: encryptSecret(secret, this.encryptionKey), secretRotatedAt: new Date() },
      include: { authorizedGroups: true },
    });
    await this.radius.syncDevice(device);
    await this.audit.record({
      admin,
      action: "device.secret.rotated",
      target: device.name,
      request,
      metadata: { nasIdentifier: device.nasIdentifier },
    });
    return { ...this.toDto(device), secret };
  }

  async update(id: string, dto: UpdateDeviceDto, admin: AdminPrincipal, request: Request) {
    const current = await this.prisma.device.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("Equipamento não encontrado.");
    if (dto.authorizedGroupIds) {
      const count = await this.prisma.group.count({ where: { id: { in: dto.authorizedGroupIds } } });
      if (count !== new Set(dto.authorizedGroupIds).size) {
        throw new BadRequestException("Um ou mais grupos não existem.");
      }
    }

    const device = await this.prisma.device.update({
      where: { id },
      data: {
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.site !== undefined ? { site: dto.site } : {}),
        ...(dto.authorizedGroupIds
          ? { authorizedGroups: { set: dto.authorizedGroupIds.map((groupId) => ({ id: groupId })) } }
          : {}),
      },
      include: { authorizedGroups: true },
    });

    await this.audit.record({
      admin,
      action: "device.updated",
      target: device.name,
      request,
      metadata: { groups: dto.authorizedGroupIds?.length ?? 0 },
    });
    return this.toDto(device);
  }

  async remove(id: string, admin: AdminPrincipal, request: Request) {
    const device = await this.prisma.device.findUnique({ where: { id } });
    if (!device) throw new NotFoundException("Equipamento não encontrado.");

    const active = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM radacct
      WHERE host(nasipaddress) = ${device.nasIp} AND acctstoptime IS NULL`;

    await this.radius.removeDevice(device.nasIdentifier);
    await this.prisma.device.delete({ where: { id } });
    await this.audit.record({
      admin,
      action: "device.deleted",
      target: device.name,
      request,
      metadata: { nasIdentifier: device.nasIdentifier, activeSessions: Number(active[0]?.count ?? 0) },
    });
    return { ok: true, activeSessions: Number(active[0]?.count ?? 0) };
  }

  private toDto(device: {
    id: string;
    name: string;
    description: string;
    vendor: string;
    model: string;
    kind: string;
    ip: string;
    nasIdentifier: string;
    nasIp: string;
    site: string;
    environment: string;
    status: string;
    lastSeenAt: Date | null;
    secretRotatedAt: Date;
    authorizedGroups: { id: string }[];
  }) {
    return {
      id: device.id,
      name: device.name,
      description: device.description,
      vendor: device.vendor.toLowerCase(),
      model: device.model,
      kind: device.kind.toLowerCase().replace("_", "-"),
      ip: device.ip,
      nasIdentifier: device.nasIdentifier,
      nasIp: device.nasIp,
      site: device.site,
      environment: device.environment.toLowerCase(),
      status: device.status.toLowerCase(),
      lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
      secretRotatedAt: device.secretRotatedAt.toISOString(),
      authorizedGroupIds: device.authorizedGroups.map((group) => group.id),
    };
  }
}
