import { decryptSecret, encryptSecret } from "./crypto";

const PREFIX = "enc:v1:";

export function encryptTotpSecret(secret: string, encryptionKey: string): string {
  if (!encryptionKey) throw new Error("ENCRYPTION_KEY ausente para cifrar TOTP.");
  return `${PREFIX}${encryptSecret(secret, encryptionKey)}`;
}

/** Compatível com segredos legados em texto puro durante a migração. */
export function decryptTotpSecret(stored: string, encryptionKey: string): string {
  if (!stored.startsWith(PREFIX)) return stored;
  if (!encryptionKey) throw new Error("ENCRYPTION_KEY ausente para decifrar TOTP.");
  return decryptSecret(stored.slice(PREFIX.length), encryptionKey);
}

export function isEncryptedTotpSecret(stored: string | null | undefined): boolean {
  return Boolean(stored?.startsWith(PREFIX));
}

export { PREFIX as TOTP_SECRET_PREFIX };
