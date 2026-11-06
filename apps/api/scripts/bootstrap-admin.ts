import "dotenv/config";
import { chmodSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";
import { authenticator } from "otplib";
import { bootstrapMessage } from "../src/common/bootstrap-message";
import { errorSummary } from "../src/common/error";
import { encryptTotpSecret } from "../src/common/totp-secret";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "";
  let totpSecret = process.env.BOOTSTRAP_ADMIN_TOTP_SECRET ?? "";
  const name = process.env.BOOTSTRAP_ADMIN_NAME ?? "Administrador";

  if (!email || !email.includes("@")) {
    throw new Error("Defina BOOTSTRAP_ADMIN_EMAIL com um e-mail válido.");
  }
  if (password.length < 14) {
    throw new Error("Defina BOOTSTRAP_ADMIN_PASSWORD com ao menos 14 caracteres.");
  }
  if (/^(senha|password|admin|trocar)/i.test(password) || new Set(password).size < 6) {
    throw new Error("A senha do bootstrap é fraca. Use um valor aleatório com 14 ou mais caracteres.");
  }

  const existing = await prisma.admin.count();
  if (existing > 0) {
    throw new Error("Já existe um administrador. O bootstrap não recria contas automaticamente.");
  }

  const group = await prisma.group.findUnique({ where: { slug: "administradores" } });
  if (!group) throw new Error("Grupo Administradores ausente. Execute o seed antes do bootstrap.");

  const encryptionKey = process.env.ENCRYPTION_KEY ?? "";
  if (!encryptionKey) throw new Error("Defina ENCRYPTION_KEY para cifrar o segredo TOTP.");

  const generatedSecret = !totpSecret;
  if (generatedSecret) totpSecret = authenticator.generateSecret();
  const passwordHash = await hash(password, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });

  const admin = await prisma.admin.create({
    data: {
      name,
      email,
      passwordHash,
      totpSecret: encryptTotpSecret(totpSecret, encryptionKey),
      mfaEnabled: true,
      groups: { connect: { id: group.id } },
    },
  });

  let totpOutputPath: string | null = null;
  if (generatedSecret) {
    totpOutputPath = process.env.BOOTSTRAP_TOTP_OUTPUT ?? "/tmp/axis-bootstrap-totp.txt";
    writeFileSync(totpOutputPath, `${totpSecret}\n`, { mode: 0o600 });
    chmodSync(totpOutputPath, 0o600);
  }

  console.log(bootstrapMessage(admin.email, totpOutputPath));
}

main()
  .catch((error) => {
    console.error(`Bootstrap falhou (${errorSummary(error)}).`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
