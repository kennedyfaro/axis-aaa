import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { authenticator } from "otplib";
import Redis from "ioredis";

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL ?? "redis://redis:6379", {
  maxRetriesPerRequest: null,
});
const BASE = process.env.SECURITY_TEST_BASE_URL ?? "http://nginx/api/v1";
const PREFIX = "p2.web.";
const PASSWORD = "SecurityP2!2026#Test";
const created = [];
const devices = [];

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

async function request(jar, method, path, body, extraHeaders = {}) {
  const headers = { Accept: "application/json", ...extraHeaders };
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
    // 204 / CSV
  }
  return { status: response.status, body: payload, response };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS  ${message}`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function clearRateLimits() {
  const keys = await redis.keys("rl:*");
  if (keys.length > 0) await redis.del(...keys);
}

async function loginAdmin(jar) {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const secret = process.env.BOOTSTRAP_ADMIN_TOTP_SECRET;
  assert(email && password && secret, "credenciais de bootstrap disponíveis");
  const first = await request(jar, "POST", "/auth/login", { email, password });
  assert(first.status === 200 && first.body?.mfaRequired, "login administrativo: primeiro fator");
  const second = await request(jar, "POST", "/auth/mfa", {
    challengeId: first.body.challengeId,
    code: authenticator.generate(secret),
  });
  assert(second.status === 200, "login administrativo: MFA");
}

async function cleanupUser(email, login) {
  await prisma.$executeRaw`DELETE FROM refresh_tokens WHERE "adminId" IN (SELECT id FROM admins WHERE email = ${email})`;
  await prisma.$executeRaw`DELETE FROM "_AdminGroups" WHERE "A" IN (SELECT id FROM admins WHERE email = ${email})`;
  await prisma.$executeRaw`DELETE FROM "_UserGroups" WHERE "B" IN (SELECT id FROM users WHERE login = ${login})`;
  await prisma.$executeRaw`DELETE FROM admins WHERE email = ${email}`;
  await prisma.$executeRaw`DELETE FROM radcheck WHERE username = ${login}`;
  await prisma.$executeRaw`DELETE FROM radreply WHERE username = ${login}`;
  await prisma.$executeRaw`DELETE FROM radusergroup WHERE username = ${login}`;
  await prisma.$executeRaw`DELETE FROM radacct WHERE username = ${login}`;
  await prisma.$executeRaw`DELETE FROM users WHERE login = ${login}`;
}

async function createUser(adminJar, groupIds, suffix, options = {}) {
  const login = `${PREFIX}${suffix}`;
  const email = `${login}@aaa.local`;
  const response = await request(adminJar, "POST", "/users", {
    name: options.name ?? `P2 ${suffix}`,
    login,
    email,
    groupIds,
    mfa: options.mfa ?? false,
    password: options.password ?? PASSWORD,
  });
  assert(
    response.status === 201 || response.status === 200,
    `usuário de teste ${suffix} criado (${response.status})`,
  );
  created.push({ email, login });
  return { ...response.body, login, email };
}

async function loginWithPassword(email, password) {
  const jar = new CookieJar();
  const response = await request(jar, "POST", "/auth/login", { email, password });
  return { jar, response };
}

async function testNotifications(adminJar, selfJar) {
  const anon = await fetch(`${BASE}/notifications`);
  assert(anon.status === 401, "notificações exigem autenticação");
  const adminList = await request(adminJar, "GET", "/notifications");
  assert(adminList.status === 200, "administrador lê notificações");
  const selfList = await request(selfJar, "GET", "/notifications");
  assert(selfList.status === 403, "usuário self-service sem users.read não lê notificações");
  const patch = await request(selfJar, "PATCH", "/notifications/inexistente/read");
  assert(patch.status === 403 || patch.status === 404, "usuário sem settings.write não altera notificações");
}

async function testExpiredSession(adminJar, selfJar, selfUser) {
  const before = await request(selfJar, "GET", "/me");
  assert(before.status === 200, "sessão self-service válida antes da expiração");

  await prisma.user.update({
    where: { id: selfUser.id },
    data: { validUntil: new Date(Date.now() - 60_000) },
  });
  const expired = await request(selfJar, "GET", "/me");
  assert(expired.status === 401, "access token de identidade expirada é rejeitado");

  await prisma.user.update({
    where: { id: selfUser.id },
    data: { validUntil: new Date(Date.now() + 86_400_000) },
  });
  const restored = await request(selfJar, "GET", "/me");
  assert(restored.status === 200, "sessão volta a valer após corrigir a validade");

  await prisma.user.update({ where: { id: selfUser.id }, data: { deletedAt: new Date() } });
  const deleted = await request(selfJar, "GET", "/me");
  assert(deleted.status === 401, "access token de identidade excluída é rejeitado");
  await prisma.user.update({ where: { id: selfUser.id }, data: { deletedAt: null } });

  await request(adminJar, "PATCH", `/users/${selfUser.id}`, { status: "blocked" });
  const blocked = await request(selfJar, "GET", "/me");
  assert(blocked.status === 401, "access token de identidade bloqueada é rejeitado");
  await request(adminJar, "PATCH", `/users/${selfUser.id}`, { status: "active" });
}

async function testSoftDeleteAndConflict(adminJar, fullGroupId) {
  const user = await createUser(adminJar, [fullGroupId], `delete-${Date.now()}`);
  const removed = await request(adminJar, "DELETE", `/users/${user.id}`);
  assert(removed.status === 200, "exclusão lógica responde");
  const detail = await request(adminJar, "GET", `/users/${user.id}`);
  assert(detail.status === 404, "detalhe de identidade excluída retorna 404");

  const duplicate = await request(adminJar, "POST", "/users", {
    name: "Duplicado",
    login: user.login,
    email: `outro.${user.email}`,
    groupIds: [fullGroupId],
    mfa: false,
    password: PASSWORD,
  });
  assert(duplicate.status === 409, "login duplicado retorna 409");
  assert(duplicate.body?.details === undefined, "409 não vaza metadados do índice/coluna");
  assert(
    typeof duplicate.body?.message === "string" && !duplicate.body.message.includes("P2002"),
    "409 não expõe código interno do Prisma",
  );
}

async function testPasswordAndMfaPolicy(adminJar, fullGroupId, adminGroupId) {
  const original = await request(adminJar, "GET", "/settings");
  assert(original.status === 200, "configurações acessíveis");
  try {
    await request(adminJar, "PATCH", "/settings", { passwordMinLength: 20 });
    const weak = await request(adminJar, "POST", "/users", {
      name: "Senha curta",
      login: `${PREFIX}short-${Date.now()}`,
      email: `${PREFIX}short-${Date.now()}@aaa.local`,
      groupIds: [fullGroupId],
      mfa: false,
      password: "SecurityP2!2026",
    });
    assert(weak.status === 400, "passwordMinLength=20 rejeita senha de 15 caracteres");

    const strong = await createUser(adminJar, [fullGroupId], `strong-${Date.now()}`, {
      password: "SecurityP2!2026#Long",
    });
    assert(Boolean(strong.id), "senha com 20+ caracteres é aceita");
  } finally {
    await request(adminJar, "PATCH", "/settings", {
      passwordMinLength: original.body.passwordMinLength,
    });
  }

  try {
    await request(adminJar, "PATCH", "/settings", { mfaRequired: false });
    const privileged = await createUser(adminJar, [adminGroupId], `priv-${Date.now()}`, {
      mfa: false,
      password: "SecurityP2!2026#Priv",
    });
    await clearRateLimits();
    const { response } = await loginWithPassword(privileged.email, "SecurityP2!2026#Priv");
    assert(
      response.status === 200 && response.body?.mfaEnrollmentRequired === true,
      "mfaRequired=false não remove MFA de identidade administrativa",
    );
  } finally {
    await request(adminJar, "PATCH", "/settings", { mfaRequired: original.body.mfaRequired });
  }

  try {
    await request(adminJar, "PATCH", "/settings", { sessionTimeoutMinutes: 5 });
    const user = await createUser(adminJar, [fullGroupId], `session-${Date.now()}`, {
      password: "SecurityP2!2026#Session",
    });
    await clearRateLimits();
    const login = await fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, password: "SecurityP2!2026#Session" }),
    });
    const cookies = login.headers.getSetCookie?.() ?? [];
    const access = cookies.find((value) => value.startsWith("aaa_access="));
    assert(login.status === 200 && Boolean(access), "login emite cookie de acesso");
    assert(access.includes("Max-Age=300"), "sessionTimeoutMinutes=5 encurta o access token para 5 min");
  } finally {
    await request(adminJar, "PATCH", "/settings", {
      sessionTimeoutMinutes: original.body.sessionTimeoutMinutes,
    });
  }
}

async function testDevicePolicy(adminJar, fullGroupId) {
  const wildcard = await request(adminJar, "POST", "/devices", {
    name: `p2-wild-${Date.now()}`,
    description: "Teste de NAS curinga",
    vendor: "other",
    model: "test",
    kind: "router",
    ip: "0.0.0.0/0",
    nasIdentifier: `p2-wild-${Date.now()}`,
    site: "Lab",
    environment: "lab",
    authorizedGroupIds: [fullGroupId],
    secret: "0123456789abcdef",
  });
  const wildcardEnabled = process.env.RADIUS_ALLOW_WILDCARD_NAS === "true";
  if (wildcardEnabled) {
    assert(
      wildcard.status === 201 || wildcard.status === 200,
      "NAS curinga 0.0.0.0/0 é aceito quando habilitado explicitamente",
    );
    if (wildcard.body?.id) {
      await request(adminJar, "DELETE", `/devices/${wildcard.body.id}`);
    }
  } else {
    assert(wildcard.status === 400, "NAS curinga 0.0.0.0/0 é rejeitado quando desabilitado");
  }

  const short = await request(adminJar, "POST", "/devices", {
    name: `p2-short-${Date.now()}`,
    description: "Teste de segredo curto",
    vendor: "other",
    model: "test",
    kind: "router",
    ip: "198.51.100.50",
    nasIdentifier: `p2-short-${Date.now()}`,
    site: "Lab",
    environment: "lab",
    authorizedGroupIds: [fullGroupId],
    secret: "12345678",
  });
  assert(short.status === 400, "segredo de NAS com 8 caracteres é rejeitado");

  const createdDevice = await request(adminJar, "POST", "/devices", {
    name: `p2-ok-${Date.now()}`,
    description: "Teste de segredo forte",
    vendor: "other",
    model: "test",
    kind: "router",
    ip: "198.51.100.51",
    nasIdentifier: `p2-ok-${Date.now()}`,
    site: "Lab",
    environment: "lab",
    authorizedGroupIds: [fullGroupId],
    secret: "0123456789abcdef0123456789abcdef",
  });
  assert(createdDevice.status === 201 || createdDevice.status === 200, "segredo de 32 caracteres é aceito");
  if (createdDevice.body?.id) devices.push(createdDevice.body.id);
}

async function testSecurityAlertTrigger(adminJar) {
  const original = await request(adminJar, "GET", "/settings");
  try {
    await request(adminJar, "PATCH", "/settings", { maxLoginAttempts: 3 });
    await clearRateLimits();
    const email = `p2.lock.${Date.now()}@aaa.local`;
    for (let index = 0; index < 4; index += 1) {
      await request(undefined, "POST", "/auth/login", {
        email,
        password: "senha-errada",
      });
    }
    const locked = await prisma.auditEvent.findFirst({
      where: { action: "auth.account.locked", target: email },
      orderBy: { at: "desc" },
    });
    assert(Boolean(locked), "bloqueio por tentativas é auditado para o alerta");
  } finally {
    await request(adminJar, "PATCH", "/settings", {
      maxLoginAttempts: original.body.maxLoginAttempts,
    });
    await clearRateLimits();
  }
}

async function main() {
  await clearRateLimits();
  const fullGroup = await prisma.group.findUnique({ where: { slug: "acesso-full" } });
  const adminGroup = await prisma.group.findUnique({ where: { slug: "administradores" } });
  assert(Boolean(fullGroup && adminGroup), "grupos de teste existem");

  const adminJar = new CookieJar();
  await loginAdmin(adminJar);

  await createUser(adminJar, [adminGroup.id], `creator-${Date.now()}`, {
    mfa: true,
    password: "SecurityP2!2026#Creator",
  });
  const selfUser = await createUser(adminJar, [fullGroup.id], `self-${Date.now()}`, {
    password: "SecurityP2!2026#Self",
  });
  await clearRateLimits();
  const selfLogin = await loginWithPassword(selfUser.email, "SecurityP2!2026#Self");
  assert(selfLogin.response.status === 200, "usuário self-service entra com senha sem MFA");

  await testNotifications(adminJar, selfLogin.jar);
  await testExpiredSession(adminJar, selfLogin.jar, selfUser);
  await testSoftDeleteAndConflict(adminJar, fullGroup.id);
  await testPasswordAndMfaPolicy(adminJar, fullGroup.id, adminGroup.id);
  await testDevicePolicy(adminJar, fullGroup.id);
  await testSecurityAlertTrigger(adminJar);

  console.log("RESULT  P2 web aprovado");
}

try {
  await main();
} finally {
  for (const id of devices) {
    try {
      await prisma.device.delete({ where: { id } }).catch(() => null);
      await prisma.$executeRaw`DELETE FROM nas WHERE shortname LIKE 'p2-%'`;
    } catch {
      // já removido
    }
  }
  for (const item of created) {
    try {
      await cleanupUser(item.email, item.login);
    } catch (error) {
      console.error(`WARN  limpeza de ${item.login}: ${error.message}`);
    }
  }
  await redis.quit();
  await prisma.$disconnect();
}
