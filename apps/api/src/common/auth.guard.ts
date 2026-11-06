import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { ACCESS_COOKIE } from "./cookies";
import { IS_PUBLIC } from "./auth.decorators";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { admin?: unknown }>();
    const bearer = request.headers.authorization?.startsWith("Bearer ")
      ? request.headers.authorization.slice(7)
      : undefined;
    const token = request.cookies?.[ACCESS_COOKIE] ?? bearer;
    if (!token) throw new UnauthorizedException("Sessão expirada. Entre novamente.");

    try {
      const payload = await this.jwt.verifyAsync<{
        sub: string;
        email: string;
        name: string;
        ver?: number;
      }>(token, {
        secret: this.config.get<string>("JWT_ACCESS_SECRET"),
        issuer: this.config.get<string>("JWT_ISSUER") ?? "axis-aaa",
        audience: this.config.get<string>("JWT_AUDIENCE") ?? "axis-panel",
        algorithms: ["HS256"],
      });
      request.admin = {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        tokenVersion: payload.ver ?? 0,
      };
      return true;
    } catch {
      throw new UnauthorizedException("Sessão expirada. Entre novamente.");
    }
  }
}
