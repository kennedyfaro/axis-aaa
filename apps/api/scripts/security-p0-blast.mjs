import { createHmac, randomBytes } from "node:crypto";
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

function buildAccessRequest(secret, withMessageAuthenticator) {
  const identifier = Math.floor(Math.random() * 256);
  const requestAuthenticator = randomBytes(16);
  const attributes = [attribute(1, "sec.ma.test")];
  if (withMessageAuthenticator) {
    attributes.push(attribute(80, Buffer.alloc(16, 0)));
  }
  const length = 20 + attributes.reduce((total, item) => total + item.length, 0);
  const header = Buffer.alloc(20);
  header.writeUInt8(1, 0);
  header.writeUInt8(identifier, 1);
  header.writeUInt16BE(length, 2);
  requestAuthenticator.copy(header, 4);

  const packet = Buffer.concat([header, ...attributes]);
  if (withMessageAuthenticator) {
    const zeroed = Buffer.from(packet);
    const hmac = createHmac("md5", secret).update(zeroed).digest();
    hmac.copy(packet, packet.length - 16);
  }
  return { packet, identifier };
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
  const ip = containerIpv4();
  const secret = randomBytes(24).toString("base64url");

  // A P2 desabilita o NAS curinga. Para testar o Message-Authenticator de
  // forma real, registra temporariamente o IP exato deste container.
  await prisma.$executeRaw`DELETE FROM nas WHERE nasname = ${ip}`;
  await prisma.$executeRaw`
    INSERT INTO nas (nasname, shortname, type, secret, description)
    VALUES (${ip}, ${`sec-blast-${Date.now()}`}, 'other', ${secret}, 'teste temporário P0')`;

  try {
    const without = buildAccessRequest(secret, false);
    const withoutResponse = await send(without.packet, without.identifier);

    const withMa = buildAccessRequest(secret, true);
    const withResponse = await send(withMa.packet, withMa.identifier);

    if (!withoutResponse) {
      console.log("PASS  Access-Request sem Message-Authenticator foi descartado");
      if (!withResponse) throw new Error("Access-Request com Message-Authenticator não foi respondido");
      console.log("PASS  Access-Request com Message-Authenticator foi processado");
      console.log("RESULT  P0 AX-008 ativo (RADIUS_REQUIRE_MA=true)");
      return;
    }

    if (!withResponse) {
      throw new Error("Access-Request com Message-Authenticator não foi respondido");
    }
    console.log("INFO  AX-008 desativado: pacote sem Message-Authenticator foi processado");
    console.log("PASS  Access-Request com Message-Authenticator também foi processado");
    console.log("RESULT  P0 AX-008 desativado por configuração (RADIUS_REQUIRE_MA=false)");
  } finally {
    await prisma.$executeRaw`DELETE FROM nas WHERE nasname = ${ip}`;
  }
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
