import { PrismaClient } from "@prisma/client";
import { authenticator } from "otplib";

const prisma = new PrismaClient();
const BASE = process.env.SECURITY_TEST_BASE_URL ?? "http://127.0.0.1:3000/api/v1";
const LOGIN = process.env.SECURITY_TEST_LOGIN;
const PASSWORD = process.env.SECURITY_TEST_PASSWORD;
const PREFIX = "sec.radius.";

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

async function cleanup() {
  const logins = `${PREFIX}%`;
  const emails = `${PREFIX}%@aaa.local`;
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
  const action = process.env.SECURITY_TEST_ACTION ?? "create";
  if (action === "cleanup") {
    await cleanup();
    console.log("PASS  limpeza executada");
    return;
  }

  assert(LOGIN && PASSWORD, "login e senha de teste informados");
  const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const adminSecret = process.env.BOOTSTRAP_ADMIN_TOTP_SECRET;
  assert(adminEmail && adminPassword && adminSecret, "credenciais de bootstrap disponíveis");

  const full = await prisma.group.findUnique({ where: { slug: "acesso-full" } });
  assert(full, "grupo Acesso Full existe");

  const debug = new CookieJar();
  const first = await request(debug, "POST", "/auth/login", { email: adminEmail, password: adminPassword });
  assert(first.status === 200 && first.body?.mfaRequired, "primeiro fator do administrador");
  const second = await request(debug, "POST", "/auth/mfa", {
    challengeId: first.body.challengeId,
    code: authenticator.generate(adminSecret),
  });
  assert(second.status === 200, "MFA do administrador");

  const validUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const created = await request(debug, "POST", "/users", {
    name: "Security Radius Expiration",
    login: LOGIN,
    email: `${LOGIN}@aaa.local`,
    groupIds: [full.id],
    mfa: true,
    password: PASSWORD,
    validUntil,
  });
  assert(created.status === 201, "identidade RADIUS criada");

  const rows = await prisma.$queryRawUnsafe(
    `SELECT attribute, value FROM radcheck WHERE username = $1 ORDER BY attribute`,
    LOGIN,
  );
  const attributes = rows.map((row) => row.attribute);
  assert(attributes.includes("NT-Password"), "radcheck contém NT-Password");
  assert(attributes.includes("Expiration"), "radcheck contém Expiration");
  const expiration = rows.find((row) => row.attribute === "Expiration");
  assert(/^\d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2}$/.test(expiration.value), "Expiration está no formato do FreeRADIUS");
  console.log(`INFO  Expiration=${expiration.value}`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
