import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { errorSummary } from "../src/common/error";

describe("errorSummary", () => {
  it("não imprime detalhes de linha do Prisma", () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      'Raw query failed. DETAIL: Failing row contains (..., "radiussea", ...)',
      { code: "P2010", clientVersion: "test" },
    );
    expect(errorSummary(error)).toBe("Prisma P2010");
  });

  it("não imprime mensagem genérica com DETAIL/Failing row", () => {
    const error = new Error("DETAIL: Failing row contains (secret=super-secreto)");
    expect(errorSummary(error)).toBe("Error");
  });

  it("preserva mensagens seguras de validação", () => {
    expect(errorSummary(new Error("Seed bloqueado em produção."))).toBe(
      "Seed bloqueado em produção.",
    );
  });

  it("redige pares de segredo em mensagens próprias", () => {
    expect(errorSummary(new Error("password=abc123 secret=xyz"))).toBe(
      "password=[REDACTED] secret=[REDACTED]",
    );
  });
});
