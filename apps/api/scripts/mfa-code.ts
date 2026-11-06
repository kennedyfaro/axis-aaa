import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { authenticator } from "otplib";
import { errorSummary } from "../src/common/error";
import { decryptTotpSecret } from "../src/common/totp-secret";

const prisma = new PrismaClient();

async function main() {
  if (process.env.MFA_CODE_ALLOW !== "true") {
    throw new Error(
      "mfa-code desabilitado. Defina MFA_CODE_ALLOW=true apenas para break-glass auditado.",
    );
  }
  const encryptionKey = process.env.ENCRYPTION_KEY ?? "";
  if (!encryptionKey) throw new Error("Defina ENCRYPTION_KEY para decifrar o TOTP.");

  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const admin = email
    ? await prisma.admin.findUnique({ where: { email } })
    : await prisma.admin.findFirst({ orderBy: { createdAt: "asc" } });
  if (!admin?.totpSecret) throw new Error("Administrador sem segredo TOTP. Execute o bootstrap.");

  const secret = decryptTotpSecret(admin.totpSecret, encryptionKey);
  const code = authenticator.generate(secret);
  const remaining = authenticator.timeRemaining();
  console.log(`Conta: ${admin.email}`);
  console.log(`Código: ${code}`);
  console.log(`Validade: ${remaining}s`);
}

main()
  .catch((error) => {
    console.error(`Falha ao gerar código (${errorSummary(error)}).`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
