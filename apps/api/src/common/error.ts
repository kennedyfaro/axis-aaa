import { Prisma } from "@prisma/client";

const UNSAFE_MESSAGE = /(failing row contains|detail:|syntax error|raw query|prisma|econnrefused|enotfound)/i;
const SECRET_PAIR = /(password|secret|token|authorization|database_url|totp|api[_-]?key)(\s*[:=]\s*)?[^\s,;]+/gi;

/**
 * Resumo seguro para logs. Erros do Prisma podem carregar
 * `DETAIL: Failing row contains (...)` com segredos; nesses casos só o
 * código/nome é registrado. Mensagens próprias e seguras são preservadas.
 */
export function errorSummary(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return `Prisma ${error.code}`;
  }
  if (error instanceof Prisma.PrismaClientValidationError) {
    return "Prisma validation error";
  }
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return "Prisma initialization error";
  }
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return "Prisma unknown request error";
  }
  if (error instanceof Prisma.PrismaClientRustPanicError) {
    return "Prisma rust panic error";
  }
  if (error instanceof Error) {
    const message = (error.message || error.name || "Error").trim();
    if (UNSAFE_MESSAGE.test(message)) return error.name || "Error";
    return message.replace(SECRET_PAIR, "$1=[REDACTED]").slice(0, 200);
  }
  return "erro desconhecido";
}
