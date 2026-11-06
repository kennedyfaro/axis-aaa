import { PrismaClient } from "@prisma/client";
import { authenticator } from "otplib";

const prisma = new PrismaClient();
const BASE = process.env.SECURITY_TEST_BASE_URL ?? "http://127.0.0.1:3000/api/v1";
const PREFIX = "sec.mfa.";
const PASSWORD = "SecurityMfa!2026#P0";

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  absorb(response) {
    for (const value of response.headers.getSetCookie?.() ?? []) {
      const [pair] = value.split(";");
      const index = pair.indexOf("=");
      if (index > 0) this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
  }

  header() {
    return [...this.cookies.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
  }

  csrf() {
    return this.cookies.get("aaa_csrf");
  }
}

async function request(jar, method, path, body) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (jar?.header()) headers.Cookie = jar.header();
  if (jar?.csrf() && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    headers["X-CSRF-Token"] = jar.csrf();
  }
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  jar?.absorb(response);
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // 204
  }
  return { status: response.status, body: payload };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS  ${message}`);
}

async function loginAdmin(jar, email, password, secret) {
  const first = await request(jar, "POST", "/auth/login", { email, password });
  assert(first.status === 200 && first.body?.mfaRequired, `primeiro fator + desafio MFA para ${email}`);
  const second = await request(jar, "POST", "/auth/mfa", {
    challengeId: first.body.challengeId,
    code: authenticator.generate(secret),
  });
  assert(second.status === 200, `MFA concluído para ${email}`);
}

async function cleanup() {
  const emails = `${PREFIX}%@aaa.local`;
  const logins = `${PREFIX}%`;
  await prisma.$executeRawUnsafe(
    `DELETE FROM refresh_tokens WHERE "adminId" IN (SELECT id FROM admins WHERE email LIKE $1)`,
    emails,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "_AdminGroups" WHERE "A" IN (SELECT id FROM admins WHERE email LIKE $1)`,
    emails,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "_UserGroups" WHERE "B" IN (SELECT id FROM users WHERE login LIKE $1)`,
    logins,
  );
  await prisma.$executeRawUnsafe(`DELETE FROM admins WHERE email LIKE $1`, emails);
  await prisma.$executeRawUnsafe(`DELETE FROM radcheck WHERE username LIKE $1`, logins);
  await prisma.$executeRawUnsafe(`DELETE FROM radreply WHERE username LIKE $1`, logins);
  await prisma.$executeRawUnsafe(`DELETE FROM radusergroup WHERE username LIKE $1`, logins);
  await prisma.$executeRawUnsafe(`DELETE FROM users WHERE login LIKE $1`, logins);
}

async function main() {
  const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const adminSecret = process.env.BOOTSTRAP_ADMIN_TOTP_SECRET;
  assert(adminEmail && adminPassword && adminSecret, "credenciais de bootstrap disponíveis");

  const admins = await prisma.group.findUnique({ where: { slug: "administradores" } });
  const full = await prisma.group.findUnique({ where: { slug: "acesso-full" } });
  assert(admins && full, "grupos necessários existem");

  await cleanup();

  const debug = new CookieJar();
  await loginAdmin(debug, adminEmail, adminPassword, adminSecret);

  const privileged = await request(debug, "POST", "/users", {
    name: "Security MFA Privileged",
    login: `${PREFIX}priv`,
    email: `${PREFIX}priv@aaa.local`,
    groupIds: [admins.id],
    mfa: false,
    password: PASSWORD,
  });
  assert(privileged.status === 201, "identidade administrativa sem MFA criada");
  assert(!privileged.body?.totpSecret, "criação não devolve segredo quando mfa=false");

  const enrollJar = new CookieJar();
  const first = await request(enrollJar, "POST", "/auth/login", {
    email: `${PREFIX}priv@aaa.local`,
    password: PASSWORD,
  });
  assert(first.status === 200, "senha correta aceita para enrollment");
  assert(first.body?.mfaEnrollmentRequired === true, "login exige enrollment de MFA");
  assert(first.body?.challengeId && first.body?.secret, "desafio e segredo de enrollment devolvidos");
  assert(!enrollJar.cookies.has("aaa_access"), "nenhuma sessão é emitida antes do TOTP");

  const enroll = await request(enrollJar, "POST", "/auth/mfa/enroll", {
    challengeId: first.body.challengeId,
    code: authenticator.generate(first.body.secret),
  });
  assert(enroll.status === 200, "enrollment concluído com código válido");
  assert(enrollJar.cookies.has("aaa_access"), "sessão emitida após enrollment");

  const me = await request(enrollJar, "GET", "/auth/me");
  assert(me.status === 200 && me.body?.email === `${PREFIX}priv@aaa.local`, "sessão de enrollment acessa /auth/me");

  const repeat = await request(new CookieJar(), "POST", "/auth/login", {
    email: `${PREFIX}priv@aaa.local`,
    password: PASSWORD,
  });
  assert(repeat.body?.mfaRequired === true, "login seguinte exige o TOTP já cadastrado");

  const selfService = await request(debug, "POST", "/users", {
    name: "Security MFA Self Service",
    login: `${PREFIX}self`,
    email: `${PREFIX}self@aaa.local`,
    groupIds: [full.id],
    mfa: false,
    password: PASSWORD,
  });
  assert(selfService.status === 201, "identidade self-service sem MFA criada");

  const selfJar = new CookieJar();
  const selfLogin = await request(selfJar, "POST", "/auth/login", {
    email: `${PREFIX}self@aaa.local`,
    password: PASSWORD,
  });
  assert(selfLogin.status === 200 && selfJar.cookies.has("aaa_access"), "self-service entra sem MFA");
  assert(selfLogin.body?.mfaEnrollmentRequired !== true, "self-service não é forçado a enrollment");

  console.log("RESULT  P0 AX-007 aprovado");
}

try {
  await main();
} finally {
  try {
    await cleanup();
  } catch (error) {
    console.error(`WARN  limpeza incompleta: ${error.message}`);
  }
  await prisma.$disconnect();
}
