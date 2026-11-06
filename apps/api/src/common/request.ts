import type { Request } from "express";
import { randomUUID } from "node:crypto";
import { isIP } from "node:net";

/**
 * O nginx sobrescreve X-Forwarded-For com o IP real da conexão.
 * A API confia em um único proxy (`trust proxy = 1`), então `req.ip`
 * já é o IP correto. Não lemos o header diretamente: ele é controlável
 * pelo cliente quando a requisição não passa pelo proxy.
 */
export function clientIp(request: Request): string {
  const raw = request.ip ?? request.socket?.remoteAddress ?? "0.0.0.0";
  const normalized = raw.startsWith("::ffff:") ? raw.slice(7) : raw;
  return isIP(normalized) ? normalized : "0.0.0.0";
}

/**
 * O request ID é sempre gerado no servidor. O header do cliente não pode
 * controlar a chave única da auditoria nem suprimir eventos por colisão.
 */
export function requestId(_request: Request): string {
  return `req_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export function userAgent(request: Request): string | undefined {
  const value = request.headers["user-agent"];
  return typeof value === "string" ? value.slice(0, 200) : undefined;
}
