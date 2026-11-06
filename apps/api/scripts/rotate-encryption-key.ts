import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { decryptSecret, encryptSecret } from "../src/common/crypto";
import { errorSummary } from "../src/common/error";
import {
  decryptTotpSecret,
  encryptTotpSecret,
  isEncryptedTotpSecret,
} from "../src/common/totp-secret";

const prisma = new PrismaClient();

async function main() {
  const oldKey = process.env.OLD_ENCRYPTION_KEY ?? "";
  const newKey = process.env.NEW_ENCRYPTION_KEY ?? "";
  if (!oldKey || !newKey) {
    throw new Error("Defina OLD_ENCRYPTION_KEY e NEW_ENCRYPTION_KEY.");
  }
  if (oldKey === newKey) {
    throw new Error("A chave nova deve ser diferente da antiga.");
  }

  // Decifra tudo antes de gravar para não deixar o banco em estado misto.
  const admins = await prisma.admin.findMany({
    where: { totpSecret: { not: null } },
    select: { id: true, totpSecret: true },
  });
  const adminUpdates = admins
    .filter((admin) => admin.totpSecret)
    .map((admin) => ({
      id: admin.id,
      totpSecret: encryptTotpSecret(
        isEncryptedTotpSecret(admin.totpSecret)
          ? decryptTotpSecret(admin.totpSecret as string, oldKey)
          : (admin.totpSecret as string),
        newKey,
      ),
    }));

  const devices = await prisma.device.findMany({
    select: { id: true, secretCipher: true },
  });
  const deviceUpdates = devices.map((device) => ({
    id: device.id,
    secretCipher: encryptSecret(decryptSecret(device.secretCipher, oldKey), newKey),
  }));

  await prisma.$transaction([
    ...adminUpdates.map((admin) =>
      prisma.admin.update({
        where: { id: admin.id },
        data: { totpSecret: admin.totpSecret },
      }),
    ),
    ...deviceUpdates.map((device) =>
      prisma.device.update({
        where: { id: device.id },
        data: { secretCipher: device.secretCipher },
      }),
    ),
  ]);

  console.log(`TOTP reencriptado: ${adminUpdates.length}`);
  console.log(`Segredos de NAS reencriptados: ${deviceUpdates.length}`);
  console.log("Agora atualize ENCRYPTION_KEY no .env e recrie a API.");
}

main()
  .catch((error) => {
    console.error(`Rotação de chave falhou (${errorSummary(error)}).`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
