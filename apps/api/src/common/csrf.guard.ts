import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { ACCESS_COOKIE, CSRF_COOKIE } from "./cookies";
import { IS_PUBLIC } from "./auth.decorators";
import { safeEqual } from "./crypto";

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method.toUpperCase();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // Clientes com Bearer token nao dependem de cookie e, portanto, nao sofrem CSRF.
    if (!request.cookies?.[ACCESS_COOKIE]) return true;

    const cookieToken = request.cookies?.[CSRF_COOKIE];
    const headerToken = request.headers["x-csrf-token"];
    if (typeof cookieToken !== "string" || typeof headerToken !== "string" || !safeEqual(cookieToken, headerToken)) {
      throw new ForbiddenException("Token CSRF ausente ou inválido.");
    }
    return true;
  }
}
