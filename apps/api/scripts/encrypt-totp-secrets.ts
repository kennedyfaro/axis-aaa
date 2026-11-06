import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { errorSummary } from "../src/common/error";
import { encryptTotpSecret, isEncryptedTotpSecret } from "../src/common/totp-secret";

const prisma = new PrismaClient();

async function main() {
  const encryptionKey = process.env.ENCRYPTION_KEY ?? "";
  if (!encryptionKey) throw new Error("ENCRYPTION_KEY é obrigatória.");

  const admins = await prisma.admin.findMany({
    where: { totpSecret: { not: null } },
    select: { id: true, totpSecret: true },
  });
  let converted = 0;
  for (const admin of admins) {
    if (!admin.totpSecret || isEncryptedTotpSecret(admin.totpSecret)) continue;
    await prisma.admin.update({
      where: { id: admin.id },
      data: { totpSecret: encryptTotpSecret(admin.totpSecret, encryptionKey) },
    });
    converted += 1;
  }
  console.log(`Segredos TOTP migrados para cifra: ${converted}`);
}

main()
  .catch((error) => {
    console.error(`Migração TOTP falhou (${errorSummary(error)}).`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
