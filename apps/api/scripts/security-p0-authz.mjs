import { PrismaClient } from "@prisma/client";
import { authenticator } from "otplib";

const prisma = new PrismaClient();
const BASE = process.env.SECURITY_TEST_BASE_URL ?? "http://127.0.0.1:3000/api/v1";
const PREFIX = "sec.test.";
const PASSWORD = "SecurityTest!2026#P0";

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  absorb(response) {
    const values = response.headers.getSetCookie?.() ?? [];
    for (const value of values) {
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
  const cookie = jar?.header();
  if (cookie) headers.Cookie = cookie;
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
    // respostas 204 não têm corpo
  }
  return { status: response.status, body: payload };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS  ${message}`);
}

function totp(secret) {
  return authenticator.generate(secret);
}

async function login(jar, email, password, secret) {
  const first = await request(jar, "POST", "/auth/login", { email, password });
  assert(first.status === 200, `login do primeiro fator aceito para ${email}`);
  assert(first.body?.mfaRequired === true && first.body?.challengeId, `MFA exigido para ${email}`);
  const second = await request(jar, "POST", "/auth/mfa", {
    challengeId: first.body.challengeId,
    code: totp(secret),
  });
  assert(second.status === 200, `MFA concluído para ${email}`);
}

async function createUser(jar, input) {
  const response = await request(jar, "POST", "/users", input);
  assert(response.status === 201 || response.status === 200, `usuário ${input.login} criado`);
  return response.body;
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
  await prisma.$executeRawUnsafe(`DELETE FROM groups WHERE slug = 'security-test-write'`);
}

async function main() {
  const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const adminSecret = process.env.BOOTSTRAP_ADMIN_TOTP_SECRET;
  assert(adminEmail && adminPassword && adminSecret, "credenciais de bootstrap disponíveis no ambiente");

  const admins = await prisma.group.findUnique({ where: { slug: "administradores" } });
  const full = await prisma.group.findUnique({ where: { slug: "acesso-full" } });
  assert(admins && full, "grupos Administradores e Acesso Full existem");

  await cleanup();

  const limited = await prisma.group.create({
    data: {
      name: "Security Test users.write",
      slug: "security-test-write",
      description: "Grupo temporário do teste de autorização P0",
      kind: "CUSTOM",
      permissions: ["users.read", "users.write", "users.block", "sessions.revoke"],
    },
  });

  const debug = new CookieJar();
  await login(debug, adminEmail, adminPassword, adminSecret);

  const actor = await createUser(debug, {
    name: "Security Test Actor",
    login: `${PREFIX}actor`,
    email: `${PREFIX}actor@aaa.local`,
    groupIds: [limited.id],
    mfa: true,
    password: PASSWORD,
  });
  assert(actor.totpSecret, "ator limitado recebeu segredo TOTP");

  const targetAdmin = await createUser(debug, {
    name: "Security Test Admin Target",
    login: `${PREFIX}admin-target`,
    email: `${PREFIX}admin-target@aaa.local`,
    groupIds: [admins.id],
    mfa: true,
    password: PASSWORD,
  });
  const targetSelf = await createUser(debug, {
    name: "Security Test Self Target",
    login: `${PREFIX}self-target`,
    email: `${PREFIX}self-target@aaa.local`,
    groupIds: [full.id],
    mfa: true,
    password: PASSWORD,
  });
  const targetGrant = await createUser(debug, {
    name: "Security Test Grant Target",
    login: `${PREFIX}grant-target`,
    email: `${PREFIX}grant-target@aaa.local`,
    groupIds: [full.id],
    mfa: true,
    password: PASSWORD,
  });

  const actorJar = new CookieJar();
  await login(actorJar, `${PREFIX}actor@aaa.local`, PASSWORD, actor.totpSecret);

  const selfEscalation = await request(actorJar, "PATCH", `/users/${actor.id}`, {
    groupIds: [admins.id],
  });
  assert(selfEscalation.status === 403, "ator não consegue alterar os próprios grupos");

  const otherEscalation = await request(actorJar, "PATCH", `/users/${targetSelf.id}`, {
    groupIds: [admins.id],
  });
  assert(otherEscalation.status === 403, "ator não consegue conceder Administradores a outra identidade");

  const totpReset = await request(actorJar, "POST", `/users/${targetAdmin.id}/totp`, {});
  assert(totpReset.status === 403, "ator não consegue regenerar TOTP de administrador superior");

  const passwordReset = await request(actorJar, "POST", `/users/${targetAdmin.id}/reset-password`, {
    password: "OutraSenha!2026#P0",
  });
  assert(passwordReset.status === 403, "ator não consegue redefinir senha de administrador superior");

  const blockAdmin = await request(actorJar, "POST", `/users/${targetAdmin.id}/block`);
  assert(blockAdmin.status === 403, "ator não consegue bloquear administrador superior");

  const revokeAdmin = await request(actorJar, "POST", `/users/${targetAdmin.id}/revoke-sessions`);
  assert(revokeAdmin.status === 403, "ator não consegue revogar sessões de administrador superior");

  const legitimate = await request(debug, "PATCH", `/users/${targetGrant.id}`, {
    groupIds: [admins.id],
  });
  assert(legitimate.status === 200, "administrador pleno continua podendo conceder Administradores");

  console.log("RESULT  P0 AX-001 aprovado");
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
