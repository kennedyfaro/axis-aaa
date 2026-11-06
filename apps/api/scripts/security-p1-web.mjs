import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { authenticator } from "otplib";
import Redis from "ioredis";

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL ?? "redis://redis:6379", {
  maxRetriesPerRequest: null,
});
const BASE = process.env.SECURITY_TEST_BASE_URL ?? "http://nginx/api/v1";
const WEB = process.env.SECURITY_TEST_WEB_URL ?? "http://nginx";
const PREFIX = "p1.web.";
const PASSWORD = "SecurityP1!2026#Test";
const created = [];

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

async function createUser(adminJar, fullGroupId, suffix, name = `P1 ${suffix}`) {
  const login = `${PREFIX}${suffix}`;
  const email = `${login}@aaa.local`;
  const response = await request(adminJar, "POST", "/users", {
    name,
    login,
    email,
    groupIds: [fullGroupId],
    mfa: true,
    password: PASSWORD,
  });
  assert(response.status === 201 || response.status === 200, `usuário de teste ${suffix} criado`);
  created.push({ email, login });
  return { ...response.body, login, email };
}

async function testXff() {
  await clearRateLimits();
  const spoof = "203.0.113.99";
  const statuses = [];
  let lastFailureEmail = "";
  for (let index = 0; index < 31; index += 1) {
    const email = `p1.xff.${Date.now()}.${index}@aaa.local`;
    const response = await request(undefined, "POST", "/auth/login", {
      email,
      password: "senha-errada",
    }, { "X-Forwarded-For": `203.0.113.${index}` });
    statuses.push(response.status);
    if (response.status === 401) lastFailureEmail = email;
  }
  assert(statuses.includes(429), "rate limit por IP não é burlado por X-Forwarded-For");
  const event = await prisma.auditEvent.findFirst({
    where: { action: "auth.login", target: lastFailureEmail, result: "FAILURE" },
    orderBy: { at: "desc" },
  });
  assert(Boolean(event), "falha de login é auditada");
  assert(event.ip !== spoof, "auditoria não registra o IP spoofado");
  assert(event.ip.startsWith("192.168.240."), "auditoria registra o IP real do proxy");
  await clearRateLimits();
}

async function testAuditRequestId(adminJar) {
  const settings = await prisma.setting.findUnique({ where: { id: 1 } });
  const organization = settings?.organization ?? "Axia";
  const fixed = "p1-fixed-request-id";
  const first = await request(adminJar, "PATCH", "/settings", { organization }, { "X-Request-Id": fixed });
  const second = await request(adminJar, "PATCH", "/settings", { organization }, { "X-Request-Id": fixed });
  assert(first.status === 200 && second.status === 200, "duas ações com o mesmo X-Request-Id são aceitas");
  const events = await prisma.auditEvent.findMany({
    where: { action: "settings.updated" },
    orderBy: { at: "desc" },
    take: 2,
  });
  assert(events.length === 2, "as duas ações foram auditadas");
  assert(events[0].requestId !== events[1].requestId, "request IDs de auditoria são únicos");
  assert(events.every((event) => event.requestId !== fixed), "request ID do cliente não controla a auditoria");
}

async function testCsv(adminJar, fullGroupId) {
  const user = await createUser(adminJar, fullGroupId, `csv-${Date.now()}`, "=1+1");
  const response = await fetch(`${BASE}/export/users`, {
    headers: { Cookie: adminJar.header() },
  });
  const csv = await response.text();
  assert(response.status === 200, "exportação CSV responde");
  assert(csv.includes("\"'=1+1\""), "célula de fórmula é neutralizada no CSV");
  await cleanupUser(user.email, user.login);
  created.pop();
}

async function testLockout(adminJar) {
  await clearRateLimits();
  const settings = await request(adminJar, "PATCH", "/settings", { maxLoginAttempts: 3 });
  assert(settings.status === 200, "maxLoginAttempts ajustado para 3");
  await redis.del("rl:config:maxLoginAttempts");
  const email = `p1.lock.${Date.now()}@aaa.local`;
  const statuses = [];
  for (let index = 0; index < 4; index += 1) {
    const response = await request(undefined, "POST", "/auth/login", {
      email,
      password: "senha-errada",
    }, { "X-Forwarded-For": `198.51.100.${index}` });
    statuses.push(response.status);
  }
  assert(statuses.slice(0, 3).every((status) => status === 401), "três falhas retornam 401");
  assert(statuses[3] === 429, "quarta tentativa bloqueia a conta temporariamente");
  const locked = await prisma.auditEvent.findFirst({
    where: { action: "auth.account.locked", target: email },
    orderBy: { at: "desc" },
  });
  assert(Boolean(locked), "bloqueio por tentativas é auditado");
  await request(adminJar, "PATCH", "/settings", { maxLoginAttempts: 5 });
  await redis.del("rl:config:maxLoginAttempts");
  await clearRateLimits();
}

async function testPasswordRevokesSessions(adminJar, fullGroupId) {
  const user = await createUser(adminJar, fullGroupId, `reset-${Date.now()}`);
  const bridge = await prisma.admin.findUnique({ where: { userId: user.id } });
  assert(Boolean(bridge), "conta de painel do usuário existe");
  await prisma.refreshToken.create({
    data: {
      adminId: bridge.id,
      tokenHash: sha256(`p1-refresh-${Date.now()}-${Math.random()}`),
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  const sessionId = `p1-${Date.now()}`;
  await prisma.$executeRaw`
    INSERT INTO radacct (acctsessionid, acctuniqueid, username, nasipaddress, acctstarttime, acctupdatetime)
    VALUES (${sessionId}, ${`u-${sessionId}`}, ${user.login}, '192.0.2.10'::inet, NOW(), NOW())`;
  const response = await request(adminJar, "POST", `/users/${user.id}/reset-password`, {
    password: "P1Reset!2026#Test",
  });
  assert(response.status === 200 || response.status === 201, "reset de senha responde");
  const session = await prisma.$queryRaw`
    SELECT acctstoptime FROM radacct WHERE acctsessionid = ${sessionId} LIMIT 1`;
  assert(Boolean(session[0]?.acctstoptime), "sessão RADIUS é encerrada após reset de senha");
  const tokens = await prisma.refreshToken.findMany({
    where: { adminId: bridge.id, revokedAt: { not: null } },
  });
  assert(tokens.length > 0, "refresh tokens do painel são revogados após reset de senha");
  await prisma.$executeRaw`DELETE FROM radacct WHERE acctsessionid = ${sessionId}`;
  await cleanupUser(user.email, user.login);
  created.pop();
}

async function testDocsAndHealth(adminJar) {
  const docs = await fetch(`${WEB}/api/docs`);
  assert(docs.status === 404, "Swagger não está exposto com ENABLE_API_DOCS=false");
  const health = await request(undefined, "GET", "/health");
  assert(health.status === 200, "health público responde");
  assert(!("mode" in health.body) && !("uptimeSeconds" in health.body), "health público não expõe modo/uptime");
  assert(
    health.body.services.every((service) => !("version" in service) && !("detail" in service) && !("latencyMs" in service)),
    "health público não expõe versões/detalhes internos",
  );
  const detailsWithoutAuth = await request(undefined, "GET", "/health/details");
  assert(detailsWithoutAuth.status === 401, "health detalhado exige autenticação");
  const details = await request(adminJar, "GET", "/health/details");
  assert(details.status === 200 && details.body.services.some((service) => "version" in service), "health detalhado autenticado");
}

async function testHeaders() {
  const response = await fetch(`${WEB}/login`);
  const headers = response.headers;
  const required = [
    "content-security-policy",
    "x-frame-options",
    "x-content-type-options",
    "referrer-policy",
    "permissions-policy",
    "cross-origin-opener-policy",
    "cross-origin-resource-policy",
  ];
  for (const header of required) {
    assert(headers.get(header), `header de segurança presente: ${header}`);
  }
  assert(headers.get("content-security-policy")?.includes("frame-ancestors 'none'"), "CSP bloqueia frame-ancestors");
}

async function main() {
  await clearRateLimits();
  const fullGroup = await prisma.group.findUnique({ where: { slug: "acesso-full" } });
  assert(Boolean(fullGroup), "grupo Acesso Full existe");
  const adminJar = new CookieJar();
  await loginAdmin(adminJar);

  await testAuditRequestId(adminJar);
  await testCsv(adminJar, fullGroup.id);
  await testLockout(adminJar);
  await testPasswordRevokesSessions(adminJar, fullGroup.id);
  await testDocsAndHealth(adminJar);
  await testHeaders();
  await testXff();

  console.log("RESULT  P1 web aprovado");
}

try {
  await main();
} finally {
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
