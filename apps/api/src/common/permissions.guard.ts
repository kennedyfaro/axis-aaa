import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { PrismaService } from "./prisma.service";
import { IS_PUBLIC, REQUIRED_PERMISSIONS, type AdminPrincipal } from "./auth.decorators";
import type { Permission } from "./permissions";

interface Candidate {
  id: string;
  name: string;
  email: string;
  status?: string;
  tokenVersion?: number;
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { admin?: Candidate }>();
    if (!request.admin) throw new UnauthorizedException();

    const admin = await this.prisma.admin.findUnique({
      where: { id: request.admin.id },
      include: { groups: true, user: true },
    });
    if (!admin || admin.status !== "ACTIVE") {
      throw new UnauthorizedException("Sessão inválida.");
    }

    if ((request.admin.tokenVersion ?? 0) !== admin.tokenVersion) {
      throw new UnauthorizedException("Sessão revogada. Entre novamente.");
    }

    // A conta de painel vinculada a uma identidade RADIUS herda a validade
    // dela. Sem esta checagem, um access token continuaria válido por até
    // 15 minutos após expiração, bloqueio ou exclusão da identidade.
    if (admin.userId) {
      const user = admin.user;
      const now = new Date();
      if (
        !user ||
        user.deletedAt ||
        user.status !== "ACTIVE" ||
        (user.validFrom && user.validFrom > now) ||
        (user.validUntil && user.validUntil < now)
      ) {
        throw new UnauthorizedException("Sessão inválida.");
      }
    }

    const permissions = [...new Set(admin.groups.flatMap((group) => group.permissions))] as Permission[];
    const principal: AdminPrincipal = {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: admin.groups[0]?.name ?? "Administrador",
      permissions,
      userId: admin.userId ?? undefined,
    };
    (request as Request & { admin?: AdminPrincipal }).admin = principal;

    const required =
      this.reflector.getAllAndOverride<Permission[]>(REQUIRED_PERMISSIONS, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (required.length > 0 && !required.every((permission) => permissions.includes(permission))) {
      throw new ForbiddenException("Seu perfil não permite esta operação.");
    }

    return true;
  }
}
