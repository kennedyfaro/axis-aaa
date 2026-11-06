import { describe, expect, it } from "vitest";
import { formatBytes, formatDateTime, formatDuration, initials, relativeTime } from "./format";

describe("format", () => {
  it("formata bytes em unidades legiveis", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5 MB");
  });

  it("inclui o ano na data e hora", () => {
    expect(formatDateTime("2026-10-28T19:48:24.000Z")).toContain("2026");
  });

  it("formata duracao entre inicio e fim", () => {
    const start = new Date(Date.now() - 90 * 60_000).toISOString();
    const end = new Date().toISOString();
    expect(formatDuration(start, end)).toBe("1 h 30 min");
  });

  it("gera iniciais com no maximo duas letras", () => {
    expect(initials("Pessoa Exemplo")).toBe("PE");
    expect(initials("Rafael")).toBe("R");
  });

  it("descreve tempo relativo no passado e no futuro", () => {
    const past = new Date(Date.now() - 5 * 60_000).toISOString();
    const future = new Date(Date.now() + 3 * 3_600_000).toISOString();
    expect(relativeTime(past)).toBe("há 5 min");
    expect(relativeTime(future)).toBe("em 3 h");
    expect(relativeTime(null)).toBe("Nunca");
  });
});
