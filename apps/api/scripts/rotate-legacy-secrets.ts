import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { decryptSecret, encryptSecret, randomToken } from "../src/common/crypto";
import { errorSummary } from "../src/common/error";

const prisma = new PrismaClient();

async function main() {
  const encryptionKey = process.env.ENCRYPTION_KEY ?? "";
  if (!encryptionKey) throw new Error("ENCRYPTION_KEY ausente.");

  const devices = await prisma.device.findMany();
  let rotated = 0;
  for (const device of devices) {
    let plain: string;
    try {
      plain = decryptSecret(device.secretCipher, encryptionKey);
    } catch {
      console.warn(`IGNORADO  ${device.name}: não foi possível decifrar o segredo.`);
      continue;
    }
    if (plain.length >= 16) continue;

    const secret = randomToken(18);
    await prisma.device.update({
      where: { id: device.id },
      data: { secretCipher: encryptSecret(secret, encryptionKey), secretRotatedAt: new Date() },
    });

    await prisma.$executeRaw`DELETE FROM nas WHERE nasname = ${device.nasIp} AND shortname = ${device.nasIdentifier}`;
    await prisma.$executeRaw`
      INSERT INTO nas (nasname, shortname, type, secret, description)
      VALUES (${device.nasIp}, ${device.nasIdentifier}, 'other', ${secret}, ${device.description})`;
    rotated += 1;
    console.log(`ROTACIONADO  ${device.name} (${device.nasIp})`);
  }
  console.log(`Concluído: ${rotated} segredo(s) de NAS rotacionado(s).`);
}

main()
  .catch((error) => {
    console.error(`Rotação falhou (${errorSummary(error)}).`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
