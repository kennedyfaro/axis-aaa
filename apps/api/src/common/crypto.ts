import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

const keyFrom = (secret: string) => createHash("sha256").update(secret).digest();

/** MD4 puro em JS: o OpenSSL 3 removeu o algoritmo do provider padrão. */
function md4(input: Buffer): Buffer {
  const length = input.length;
  const bitLength = BigInt(length) * 8n;
  const paddedLength = ((length + 8) >> 6 << 6) + 64;
  const buffer = Buffer.alloc(paddedLength);
  input.copy(buffer);
  buffer[length] = 0x80;
  buffer.writeBigUInt64LE(bitLength, paddedLength - 8);

  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;

  const rol = (value: number, shift: number) => (value << shift) | (value >>> (32 - shift));
  const add = (...values: number[]) => values.reduce((sum, value) => (sum + value) >>> 0, 0) >>> 0;

  for (let offset = 0; offset < paddedLength; offset += 64) {
    const x: number[] = [];
    for (let i = 0; i < 16; i += 1) x.push(buffer.readUInt32LE(offset + i * 4));

    let aa = a;
    let bb = b;
    let cc = c;
    let dd = d;

    const f = (u: number, v: number, w: number) => (u & v) | (~u & w);
    const g = (u: number, v: number, w: number) => (u & v) | (u & w) | (v & w);
    const h = (u: number, v: number, w: number) => u ^ v ^ w;

    const round1 = [3, 7, 11, 19];
    for (let i = 0; i < 16; i += 1) {
      const s = round1[i % 4];
      if (i % 4 === 0) a = rol(add(a, f(b, c, d), x[i]), s);
      else if (i % 4 === 1) d = rol(add(d, f(a, b, c), x[i]), s);
      else if (i % 4 === 2) c = rol(add(c, f(d, a, b), x[i]), s);
      else b = rol(add(b, f(c, d, a), x[i]), s);
    }

    const order2 = [0, 4, 8, 12, 1, 5, 9, 13, 2, 6, 10, 14, 3, 7, 11, 15];
    const round2 = [3, 5, 9, 13];
    for (let i = 0; i < 16; i += 1) {
      const s = round2[i % 4];
      const k = x[order2[i]];
      if (i % 4 === 0) a = rol(add(a, g(b, c, d), k, 0x5a827999), s);
      else if (i % 4 === 1) d = rol(add(d, g(a, b, c), k, 0x5a827999), s);
      else if (i % 4 === 2) c = rol(add(c, g(d, a, b), k, 0x5a827999), s);
      else b = rol(add(b, g(c, d, a), k, 0x5a827999), s);
    }

    const order3 = [0, 8, 4, 12, 2, 10, 6, 14, 1, 9, 5, 13, 3, 11, 7, 15];
    const round3 = [3, 9, 11, 15];
    for (let i = 0; i < 16; i += 1) {
      const s = round3[i % 4];
      const k = x[order3[i]];
      if (i % 4 === 0) a = rol(add(a, h(b, c, d), k, 0x6ed9eba1), s);
      else if (i % 4 === 1) d = rol(add(d, h(a, b, c), k, 0x6ed9eba1), s);
      else if (i % 4 === 2) c = rol(add(c, h(d, a, b), k, 0x6ed9eba1), s);
      else b = rol(add(b, h(c, d, a), k, 0x6ed9eba1), s);
    }

    a = add(a, aa);
    b = add(b, bb);
    c = add(c, cc);
    d = add(d, dd);
  }

  const output = Buffer.alloc(16);
  output.writeUInt32LE(a, 0);
  output.writeUInt32LE(b, 4);
  output.writeUInt32LE(c, 8);
  output.writeUInt32LE(d, 12);
  return output;
}

/** NT-Password (MD4 de UTF-16LE). Formato aceito pelo rlm_mschap do FreeRADIUS. */
export function ntPassword(password: string): string {
  return md4(Buffer.from(password, "utf16le")).toString("hex").toUpperCase();
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** AES-256-GCM para segredos reversiveis que o FreeRADIUS precisa consumir. */
export function encryptSecret(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptSecret(payload: string, secret: string): string {
  const [ivPart, tagPart, dataPart] = payload.split(".");
  if (!ivPart || !tagPart || !dataPart) throw new Error("Cipher invalido");
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret), Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataPart, "base64url")), decipher.final()]).toString("utf8");
}

export function redirectSafe(origin: string | undefined, allowed: string[]): string | undefined {
  if (!origin) return undefined;
  return allowed.includes(origin) ? origin : undefined;
}
