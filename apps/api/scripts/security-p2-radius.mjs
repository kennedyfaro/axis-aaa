import { randomBytes } from "node:crypto";
import { createSocket } from "node:dgram";
import { networkInterfaces } from "node:os";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const HOST = process.env.SECURITY_RADIUS_HOST ?? "freeradius";
const PORT = Number(process.env.SECURITY_RADIUS_PORT ?? 1812);

function attribute(type, value) {
  const data = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
  const packet = Buffer.alloc(2 + data.length);
  packet.writeUInt8(type, 0);
  packet.writeUInt8(2 + data.length, 1);
  data.copy(packet, 2);
  return packet;
}

function buildAccessRequest() {
  const identifier = Math.floor(Math.random() * 256);
  const requestAuthenticator = randomBytes(16);
  const attributes = [attribute(1, `p2.probe.${Date.now()}`)];
  const length = 20 + attributes.reduce((total, item) => total + item.length, 0);
  const header = Buffer.alloc(20);
  header.writeUInt8(1, 0);
  header.writeUInt8(identifier, 1);
  header.writeUInt16BE(length, 2);
  requestAuthenticator.copy(header, 4);
  return { packet: Buffer.concat([header, ...attributes]), identifier };
}

function send(packet, identifier) {
  return new Promise((resolve) => {
    const socket = createSocket("udp4");
    let settled = false;
    const finish = (received) => {
      if (settled) return;
      settled = true;
      try {
        socket.close();
      } catch {
        // já fechado
      }
      resolve(received);
    };
    socket.on("message", (message) => {
      if (message.length >= 20 && message.readUInt8(1) === identifier) finish(true);
    });
    socket.on("error", () => finish(false));
    socket.send(packet, PORT, HOST, () => undefined);
    setTimeout(() => finish(false), 2000);
  });
}

function containerIpv4() {
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) return entry.address;
    }
  }
  throw new Error("Não foi possível determinar o IPv4 do container");
}

async function main() {
  if (process.env.RADIUS_ALLOW_WILDCARD_NAS === "true") {
    console.log("SKIP  RADIUS_ALLOW_WILDCARD_NAS=true: teste de curinga não se aplica");
    return;
  }

  const phase = process.env.SECURITY_TEST_PHASE ?? "exact";
  const ip = containerIpv4();
  const secret = randomBytes(24).toString("base64url");
  await prisma.$executeRaw`DELETE FROM nas WHERE nasname = ${ip}`;

  try {
    if (phase === "unknown") {
      const unknown = buildAccessRequest();
      const unknownResponse = await send(unknown.packet, unknown.identifier);
      if (unknownResponse) {
        throw new Error("FreeRADIUS respondeu a um IP não cadastrado (curinga ainda ativo)");
      }
      console.log("PASS  IP não cadastrado é descartado (sem NAS curinga)");
    } else if (phase === "exact") {
      await prisma.$executeRaw`
        INSERT INTO nas (nasname, shortname, type, secret, description)
        VALUES (${ip}, ${`p2-radius-${Date.now()}`}, 'other', ${secret}, 'teste temporário P2')`;

      const known = buildAccessRequest();
      const knownResponse = await send(known.packet, known.identifier);
      if (!knownResponse) {
        throw new Error("FreeRADIUS não respondeu ao IP cadastrado com segredo válido");
      }
      console.log("PASS  IP cadastrado com segredo válido é processado");
    } else {
      throw new Error(`SECURITY_TEST_PHASE inválida: ${phase}`);
    }
    console.log("RESULT  P2 AX-020 aprovado");
  } finally {
    await prisma.$executeRaw`DELETE FROM nas WHERE nasname = ${ip}`;
  }
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
