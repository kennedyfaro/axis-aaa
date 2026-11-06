import { describe, expect, it, vi } from "vitest";
import { SessionsService } from "../src/sessions/sessions.service";

const activeRow = {
  radacctid: 1n,
  acctsessionid: "sess-1",
  username: "kennedy.matos",
  nasipaddress: "100.65.0.202",
  framedipaddress: "192.168.128.2/32",
  acctstoptime: null,
  nasidentifier: "BR-PA-CAH-CCL-NAT-01",
};

function build(row: unknown, coaResult: unknown, changed = 1) {
  const prisma = { $queryRaw: vi.fn().mockResolvedValue([row]) };
  const radius = { revokeSession: vi.fn().mockResolvedValue(changed) };
  const coa = { disconnect: vi.fn().mockResolvedValue(coaResult) };
  return {
    service: new SessionsService(prisma as never, radius as never, coa as never),
    prisma,
    radius,
    coa,
  };
}

describe("revogação de sessão", () => {
  it("desconecta no NAS e encerra o accounting", async () => {
    const { service, coa, radius } = build(activeRow, {
      status: "ack",
      disconnected: true,
      message: "O NAS confirmou o encerramento da sessão.",
    });
    const result = await service.revoke("1");
    expect(result.revoked).toBe(true);
    expect(result.disconnected).toBe(true);
    expect(result.coaStatus).toBe("ack");
    expect(result.message).toContain("desconectada no NAS");
    expect(coa.disconnect).toHaveBeenCalledWith(
      expect.objectContaining({
        username: "kennedy.matos",
        acctSessionId: "sess-1",
        nasIp: "100.65.0.202",
      }),
    );
    expect(radius.revokeSession).toHaveBeenCalledWith(1n);
  });

  it("não envia CoA para sessão já encerrada", async () => {
    const { service, coa, radius } = build(
      { ...activeRow, acctstoptime: new Date() },
      { status: "ack", disconnected: true, message: "ignorado" },
    );
    const result = await service.revoke("1");
    expect(result.revoked).toBe(false);
    expect(result.coaStatus).toBe("none");
    expect(result.message).toContain("já encerrada");
    expect(coa.disconnect).not.toHaveBeenCalled();
    expect(radius.revokeSession).not.toHaveBeenCalled();
  });

  it("conta desconexões ao revogar todas as sessões da identidade", async () => {
    const rows = [
      activeRow,
      { ...activeRow, radacctid: 2n, acctsessionid: "sess-2" },
    ];
    const prisma = { $queryRaw: vi.fn().mockResolvedValue(rows) };
    const radius = { revokeSession: vi.fn().mockResolvedValue(1) };
    const coa = {
      disconnect: vi
        .fn()
        .mockResolvedValueOnce({ status: "ack", disconnected: true, message: "ok" })
        .mockResolvedValueOnce({ status: "timeout", disconnected: false, message: "timeout" }),
    };
    const service = new SessionsService(prisma as never, radius as never, coa as never);
    const result = await service.revokeAllForUser("kennedy.matos");
    expect(result).toEqual({ revoked: 2, disconnected: 1 });
    expect(radius.revokeSession).toHaveBeenCalledTimes(2);
  });
});
