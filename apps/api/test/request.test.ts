import { describe, expect, it } from "vitest";
import type { Request } from "express";
import { clientIp, requestId } from "../src/common/request";

function request(ip: unknown, forwarded?: string) {
  return {
    ip,
    headers: forwarded ? { "x-forwarded-for": forwarded } : {},
    socket: {},
  } as unknown as Request;
}

describe("clientIp", () => {
  it("usa req.ip e ignora X-Forwarded-For controlado pelo cliente", () => {
    expect(clientIp(request("203.0.113.10", "198.51.100.99"))).toBe("203.0.113.10");
  });

  it("normaliza IPv4 mapeado em IPv6", () => {
    expect(clientIp(request("::ffff:203.0.113.10"))).toBe("203.0.113.10");
  });

  it("não devolve valores inválidos", () => {
    expect(clientIp(request("not-an-ip"))).toBe("0.0.0.0");
    expect(clientIp(request(undefined))).toBe("0.0.0.0");
  });
});

describe("requestId", () => {
  it("ignora o header do cliente e gera IDs únicos no servidor", () => {
    const req = {
      headers: { "x-request-id": "forjado-pelo-cliente" },
    } as unknown as Request;
    const first = requestId(req);
    const second = requestId(req);
    expect(first).toMatch(/^req_[a-f0-9]{16}$/);
    expect(second).toMatch(/^req_[a-f0-9]{16}$/);
    expect(first).not.toBe(second);
    expect(first).not.toBe("forjado-pelo-cliente");
  });
});
