import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Response } from "express";
import { errorSummary } from "./error";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === "P2002") {
        // Não devolvemos exception.meta: ele revela nomes de colunas/índices
        // e valores concorrentes para quem tenta enumerar registros.
        return response.status(HttpStatus.CONFLICT).json({
          message: "Já existe um registro com este valor único.",
        });
      }
      if (exception.code === "P2025") {
        return response.status(HttpStatus.NOT_FOUND).json({ message: "Registro não encontrado." });
      }
    }

    if (!(exception instanceof HttpException)) {
      // Não logar stack/mensagem crua: erros do Prisma podem incluir valores
      // de colunas sensíveis (por exemplo, o shared secret de um NAS).
      this.logger.error(`Falha inesperada no servidor (${errorSummary(exception)}).`);
      return response.status(500).json({ message: "Falha inesperada no servidor." });
    }

    const status = exception.getStatus();
    const body = exception.getResponse();
    if (typeof body === "string") {
      return response.status(status).json({ message: body });
    }

    const payload = body as { message?: string | string[]; details?: unknown; error?: string };
    const isValidation = Array.isArray(payload.message);
    const message = isValidation
      ? "Revise os dados enviados."
      : (payload.message ?? exception.message ?? "Falha na requisição.");

    return response.status(status).json({
      message,
      details: isValidation ? payload.message : payload.details,
    });
  }
}
