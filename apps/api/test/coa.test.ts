import { createHash } from "node:crypto";
import { createSocket, type RemoteInfo, type Socket } from "node:dgram";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { buildDisconnectPacket, sendDisconnect } from "../src/radius/coa";

const SECRET = "coa-test-secret";
const servers: Socket[] = [];

afterEach(() => {
  for (const server of servers) {
    try {
      server.close();
    } catch {
      // já fechado
    }
  }
  servers.length = 0;
});

async function startServer() {
  const socket = createSocket("udp4");
  servers.push(socket);
  await new Promise<void>((resolve) => socket.bind(0, "127.0.0.1", resolve));
  return { socket, port: (socket.address() as AddressInfo).port };
}

function responseFor(request: Buffer, code: 41 | 42, errorCause?: number) {
  const identifier = request.readUInt8(1);
  const requestAuthenticator = request.subarray(4, 20);
  const attributes = errorCause ? Buffer.alloc(6) : Buffer.alloc(0);
  if (errorCause) {
    attributes.writeUInt8(101, 0);
    attributes.writeUInt8(6, 1);
    attributes.writeUInt32BE(errorCause, 2);
  }
  const header = Buffer.alloc(20);
  header.writeUInt8(code, 0);
  header.writeUInt8(identifier, 1);
  header.writeUInt16BE(20 + attributes.length, 2);
  const authenticator = createHash("md5")
    .update(
      Buffer.concat([
        header.subarray(0, 4),
        requestAuthenticator,
        attributes,
        Buffer.from(SECRET, "utf8"),
      ]),
    )
    .digest();
  authenticator.copy(header, 4);
  return Buffer.concat([header, attributes]);
}

function respond(
  socket: Socket,
  code: 41 | 42,
  errorCause?: number,
  mutate?: (packet: Buffer) => void,
) {
  socket.on("message", (request: Buffer, rinfo: RemoteInfo) => {
    const response = responseFor(request, code, errorCause);
    mutate?.(response);
    socket.send(response, rinfo.port, rinfo.address);
  });
}

function attributesOf(packet: Buffer) {
  const attributes: Record<number, Buffer> = {};
  let offset = 20;
  const length = packet.readUInt16BE(2);
  while (offset + 2 <= length) {
    const type = packet.readUInt8(offset);
    const size = packet.readUInt8(offset + 1);
    if (size < 2 || offset + size > length) break;
    attributes[type] = packet.subarray(offset + 2, offset + size);
    offset += size;
  }
  return attributes;
}

describe("CoA/Disconnect", () => {
  it("monta o Disconnect-Request com os atributos de identificação", () => {
    const { packet } = buildDisconnectPacket(
      {
        username: "kennedy.matos",
        acctSessionId: "84000001",
        nasIp: "100.65.0.202",
        nasIdentifier: "BR-PA-CAH-CCL-NAT-01",
        framedIpAddress: "192.168.128.2/32",
      },
      SECRET,
      42,
    );
    expect(packet.readUInt8(0)).toBe(40);
    expect(packet.readUInt8(1)).toBe(42);
    expect(packet.readUInt16BE(2)).toBe(packet.length);
    const attributes = attributesOf(packet);
    expect(attributes[1]?.toString()).toBe("kennedy.matos");
    expect(attributes[4]).toEqual(Buffer.from([100, 65, 0, 202]));
    expect(attributes[8]).toEqual(Buffer.from([192, 168, 128, 2]));
    expect(attributes[32]?.toString()).toBe("BR-PA-CAH-CCL-NAT-01");
    expect(attributes[44]?.toString()).toBe("84000001");
  });

  it("aceita Disconnect-ACK válido", async () => {
    const { socket, port } = await startServer();
    respond(socket, 41);
    const result = await sendDisconnect({
      username: "kennedy.matos",
      acctSessionId: "84000001",
      nasIp: "127.0.0.1",
      secret: SECRET,
      port,
      timeoutMs: 1000,
    });
    expect(result.status).toBe("ack");
    expect(result.message).toContain("confirmou");
  });

  it("interpreta Disconnect-NAK e Error-Cause", async () => {
    const { socket, port } = await startServer();
    respond(socket, 42, 503);
    const result = await sendDisconnect({
      username: "kennedy.matos",
      acctSessionId: "84000001",
      nasIp: "127.0.0.1",
      secret: SECRET,
      port,
      timeoutMs: 1000,
    });
    expect(result.status).toBe("nak");
    expect(result.errorCause).toBe(503);
    expect(result.message).toContain("sessão não encontrada");
  });

  it("ignora resposta com autenticador inválido e expira", async () => {
    const { socket, port } = await startServer();
    respond(socket, 41, undefined, (packet) => {
      packet[4] ^= 0xff;
    });
    const result = await sendDisconnect({
      username: "kennedy.matos",
      acctSessionId: "84000001",
      nasIp: "127.0.0.1",
      secret: SECRET,
      port,
      timeoutMs: 250,
    });
    expect(result.status).toBe("timeout");
  });

  it("retorna timeout quando o NAS não responde", async () => {
    const { port } = await startServer();
    const result = await sendDisconnect({
      username: "kennedy.matos",
      acctSessionId: "84000001",
      nasIp: "127.0.0.1",
      secret: SECRET,
      port,
      timeoutMs: 250,
    });
    expect(result.status).toBe("timeout");
  });
});
