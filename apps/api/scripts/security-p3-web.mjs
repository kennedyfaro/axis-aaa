import { PrismaClient } from "@prisma/client";
import { authenticator } from "otplib";
import Redis from "ioredis";

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL ?? "redis://redis:6379", {
  maxRetriesPerRequest: null,
});
const BASE = process.env.SECURITY_TEST_BASE_URL ?? "http://nginx/api/v1";
const PREFIX = "p3.web.";
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
    // 204 / CSV
  }
  return { status: response.status, body: payload, response };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS  ${message}`);
}

async function clearRateLimits() {
  const keys = await redis.keys("rl:*");
  if (keys.length > 0) await redis.del(...keys);
}

async function loginAdmin() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const secret = process.env.BOOTSTRAP_ADMIN_TOTP_SECRET;
  assert(email && password && secret, "credenciais de bootstrap disponíveis");
  const jar = new CookieJar();
  const first = await request(jar, "POST", "/auth/login", { email, password });
  assert(first.status === 200 && first.body?.mfaRequired, "login administrativo: primeiro fator");
  const second = await request(jar, "POST", "/auth/mfa", {
    challengeId: first.body.challengeId,
    code: authenticator.generate(secret),
  });
  assert(second.status === 200, "login administrativo: MFA");
  return jar;
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
  const password = options.password ?? "P3Security!2026#Test";
  const response = await request(adminJar, "POST", "/users", {
    name: options.name ?? `P3 ${suffix}`,
    login,
    email,
    groupIds,
    mfa: options.mfa ?? false,
    password,
  });
  assert(
    response.status === 201 || response.status === 200,
    `usuário de teste ${suffix} criado (${response.status})`,
  );
  created.push({ email, login });
  return { ...response.body, login, email, password };
}

async function loginPassword(email, password) {
  const jar = new CookieJar();
  const result = await request(jar, "POST", "/auth/login", { email, password });
  return { jar, result };
}

async function insertSession(login) {
  const sessionId = `p3-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  await prisma.$executeRaw`
    INSERT INTO radacct (acctsessionid, acctuniqueid, username, nasipaddress, acctstarttime, acctupdatetime)
    VALUES (${sessionId}, ${`u-${sessionId}`}, ${login}, '192.0.2.10'::inet, NOW(), NOW())`;
  return sessionId;
}

async function sessionStopped(sessionId) {
  const rows = await prisma.$queryRaw`
    SELECT acctstoptime FROM radacct WHERE acctsessionid = ${sessionId} LIMIT 1`;
  return Boolean(rows[0]?.acctstoptime);
}

async function testMfaBlockedIdentity(adminJar, adminGroupId) {
  await clearRateLimits();
  const user = await createUser(adminJar, [adminGroupId], `mfablk-${String(Date.now()).slice(-10)}`, {
    mfa: true,
    password: "P3Mfa!2026#Blocked",
  });
  assert(Boolean(user.totpSecret), "segredo TOTP do usuário de teste disponível");

  const jar = new CookieJar();
  const first = await request(jar, "POST", "/auth/login", {
    email: user.email,
    password: "P3Mfa!2026#Blocked",
  });
  assert(
    first.status === 200 && first.body?.mfaRequired && Boolean(first.body.challengeId),
    "primeiro fator emitido para identidade administrativa",
  );

  await prisma.admin.update({ where: { email: user.email }, data: { status: "BLOCKED" } });
  const blocked = await request(jar, "POST", "/auth/mfa", {
    challengeId: first.body.challengeId,
    code: authenticator.generate(user.totpSecret),
  });
  assert(blocked.status === 401, "MFA de administrador bloqueado é rejeitado");

  const event = await prisma.auditEvent.findFirst({
    where: { action: "auth.mfa.failed", target: user.email },
    orderBy: { at: "desc" },
  });
  assert(Boolean(event), "falha de MFA de sessão inválida é auditada");
}

async function testMfaAttemptLimit(adminJar, adminGroupId) {
  await clearRateLimits();
  const user = await createUser(adminJar, [adminGroupId], `mfaatt-${String(Date.now()).slice(-10)}`, {
    mfa: true,
    password: "P3Mfa!2026#Attempts",
  });
  assert(Boolean(user.totpSecret), "segredo TOTP do segundo usuário disponível");

  const jar = new CookieJar();
  const first = await request(jar, "POST", "/auth/login", {
    email: user.email,
    password: "P3Mfa!2026#Attempts",
  });
  assert(first.status === 200 && Boolean(first.body?.challengeId), "desafio MFA emitido");

  const current = authenticator.generate(user.totpSecret);
  const wrong = String((Number(current) + 1) % 1_000_000).padStart(6, "0");
  const wrongStatuses = [];
  for (let index = 0; index < 5; index += 1) {
    const result = await request(jar, "POST", "/auth/mfa", {
      challengeId: first.body.challengeId,
      code: wrong,
    });
    wrongStatuses.push(result.status);
  }
  assert(
    wrongStatuses.every((status) => status === 401),
    "cinco códigos errados retornam 401",
  );

  const sixth = await request(jar, "POST", "/auth/mfa", {
    challengeId: first.body.challengeId,
    code: authenticator.generate(user.totpSecret),
  });
  assert(sixth.status === 429, "sexta tentativa invalida o desafio e retorna 429");

  const locked = await prisma.auditEvent.findFirst({
    where: { action: "auth.mfa.locked", target: user.email },
    orderBy: { at: "desc" },
  });
  assert(Boolean(locked), "bloqueio do desafio MFA é auditado");
}

async function testJwtRevocation(adminJar, fullGroupId) {
  await clearRateLimits();
  const user = await createUser(adminJar, [fullGroupId], `jwt-${String(Date.now()).slice(-10)}`, {
    password: "P3Jwt!2026#Before",
  });
  const login = await loginPassword(user.email, "P3Jwt!2026#Before");
  assert(login.result.status === 200, "usuário self-service autenticado");

  const before = await request(login.jar, "GET", "/me");
  assert(before.status === 200, "access token válido antes do reset");

  const reset = await request(adminJar, "POST", `/users/${user.id}/reset-password`, {
    password: "P3Jwt!2026#After",
  });
  assert(reset.status === 200 || reset.status === 201, "reset de senha responde");

  const after = await request(login.jar, "GET", "/me");
  assert(after.status === 401, "access token antigo é rejeitado após reset de senha");

  const refresh = await request(login.jar, "POST", "/auth/refresh");
  assert(refresh.status === 401, "refresh token antigo é rejeitado após reset de senha");
}

async function testSessionRevocation(adminJar, fullGroupId, viewGroupId) {
  await clearRateLimits();

  const statusUser = await createUser(adminJar, [fullGroupId], `sessst-${String(Date.now()).slice(-10)}`, {
    password: "P3Session!2026#Status",
  });
  const statusSession = await insertSession(statusUser.login);
  const statusPatch = await request(adminJar, "PATCH", `/users/${statusUser.id}`, {
    status: "blocked",
  });
  assert(statusPatch.status === 200, "PATCH de status bloqueado responde");
  assert(await sessionStopped(statusSession), "sessão RADIUS é encerrada ao bloquear via PATCH");

  const groupUser = await createUser(adminJar, [fullGroupId], `sessgr-${String(Date.now()).slice(-10)}`, {
    password: "P3Session!2026#Group",
  });
  const groupLogin = await loginPassword(groupUser.email, "P3Session!2026#Group");
  assert(groupLogin.result.status === 200, "usuário de grupo autenticado no painel");
  const groupSession = await insertSession(groupUser.login);
  const groupPatch = await request(adminJar, "PATCH", `/users/${groupUser.id}`, {
    groupIds: [viewGroupId],
  });
  assert(groupPatch.status === 200, "PATCH de grupos responde");
  assert(await sessionStopped(groupSession), "sessão RADIUS é encerrada ao mudar grupos");
  const groupToken = await request(groupLogin.jar, "GET", "/me");
  assert(groupToken.status === 401, "access token antigo é rejeitado após mudança de grupos");

  const validUser = await createUser(adminJar, [fullGroupId], `sessvl-${String(Date.now()).slice(-10)}`, {
    password: "P3Session!2026#Valid",
  });
  const validSession = await insertSession(validUser.login);
  const validPatch = await request(adminJar, "PATCH", `/users/${validUser.id}`, {
    validUntil: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
  });
  assert(validPatch.status === 200, "PATCH de validade responde");
  assert(await sessionStopped(validSession), "sessão RADIUS é encerrada ao mudar validade");
}

async function testDuplicateNasIp(adminJar, fullGroupId) {
  const ip = "198.51.100.88";
  const now = String(Date.now()).slice(-10);
  const payload = (suffix, secret) => ({
    name: `p3dup-${suffix}-${now}`.slice(0, 48),
    description: "Teste de IP de NAS duplicado",
    vendor: "other",
    model: "test",
    kind: "router",
    ip,
    nasIdentifier: `p3dup-${suffix}-${now}`.slice(0, 48),
    site: "Lab",
    environment: "lab",
    authorizedGroupIds: [fullGroupId],
    secret,
  });

  const first = await request(adminJar, "POST", "/devices", payload("a", "a".repeat(32)));
  assert(
    first.status === 201 || first.status === 200,
    "primeiro NAS com IP de teste é aceito",
  );
  try {
    const second = await request(adminJar, "POST", "/devices", payload("b", "b".repeat(32)));
    assert(second.status === 400, "segundo NAS com o mesmo IP é rejeitado");
  } finally {
    if (first.body?.id) {
      await request(adminJar, "DELETE", `/devices/${first.body.id}`);
    }
  }
}

function decodeJwt(token) {
  const parts = token.split(".");
  assert(parts.length === 3, "access token tem formato JWT");
  return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
}

async function testJwtClaims(adminJar) {
  const access = adminJar.cookies.get("aaa_access");
  assert(Boolean(access), "cookie de access token disponível");
  const claims = decodeJwt(access);
  assert(claims.iss === (process.env.JWT_ISSUER ?? "axis-aaa"), "JWT contém issuer esperado");
  assert(claims.aud === (process.env.JWT_AUDIENCE ?? "axis-panel"), "JWT contém audience esperada");
  assert(typeof claims.jti === "string" && claims.jti.length >= 16, "JWT contém jti único");
}

async function testEffectiveSettings(adminJar) {
  const before = await request(adminJar, "GET", "/settings");
  assert(before.status === 200, "configurações atuais disponíveis");
  const invalid = await request(adminJar, "PATCH", "/settings", {
    sessionTimeoutMinutes: 20,
    passwordMinLength: 12,
  });
  assert(invalid.status === 200, "PATCH de configurações responde");
  assert(invalid.body?.sessionTimeoutMinutes === 15, "timeout efetivo é limitado a 15 minutos");
  assert(invalid.body?.passwordMinLength === 14, "senha mínima efetiva é 14");
  await request(adminJar, "PATCH", "/settings", {
    sessionTimeoutMinutes: before.body.sessionTimeoutMinutes,
    passwordMinLength: before.body.passwordMinLength,
  });
}

async function testRefreshBinding(adminJar, fullGroupId) {
  await clearRateLimits();
  const user = await createUser(adminJar, [fullGroupId], `refbind-${String(Date.now()).slice(-10)}`, {
    password: "P3Refresh!2026#Bind",
  });
  const login = await loginPassword(user.email, "P3Refresh!2026#Bind");
  assert(login.result.status === 200, "usuário de binding autenticado");
  const refreshToken = login.jar.cookies.get("aaa_refresh");
  assert(Boolean(refreshToken), "refresh token emitido");

  const response = await fetch(`${BASE}/auth/refresh`, {
    method: "POST",
    headers: {
      Cookie: `aaa_refresh=${refreshToken}`,
      "User-Agent": "P3-Refresh-Attacker/1.0",
      Accept: "application/json",
    },
  });
  assert(response.status === 401, "refresh token rejeitado em outro dispositivo (User-Agent)");

  const after = await request(login.jar, "GET", "/me");
  assert(after.status === 401, "access token revogado após uso suspeito do refresh");
}

async function testRadiusAttributeAllowlist(adminJar, groupId) {
  const denied = await request(adminJar, "PATCH", `/groups/${groupId}`, {
    radiusAttributes: { "Auth-Type": "Accept" },
  });
  assert(denied.status === 400, "atributo de controle RADIUS é rejeitado");

  const deniedFramed = await request(adminJar, "PATCH", `/groups/${groupId}`, {
    radiusAttributes: { "Framed-IP-Address": "203.0.113.9" },
  });
  assert(deniedFramed.status === 400, "Framed-IP-Address manual é rejeitado");

  const newline = await request(adminJar, "PATCH", `/groups/${groupId}`, {
    radiusAttributes: { "Session-Timeout": "600\nAuth-Type=Accept" },
  });
  assert(newline.status === 400, "valor com quebra de linha é rejeitado");
}

async function testHealthRateLimit() {
  await clearRateLimits();
  let last = 0;
  for (let index = 0; index < 61; index += 1) {
    const response = await fetch(`${BASE}/health`, { headers: { Accept: "application/json" } });
    last = response.status;
  }
  assert(last === 429, "health público aplica rate limit por IP");
}

async function main() {
  await clearRateLimits();
  const fullGroup = await prisma.group.findUnique({ where: { slug: "acesso-full" } });
  const adminGroup = await prisma.group.findUnique({ where: { slug: "administradores" } });
  const viewGroup = await prisma.group.findUnique({ where: { slug: "acesso-visualizacao" } });
  assert(Boolean(fullGroup && adminGroup && viewGroup), "grupos de teste existem");

  const adminJar = await loginAdmin();
  await testJwtClaims(adminJar);
  await testMfaBlockedIdentity(adminJar, adminGroup.id);
  await testMfaAttemptLimit(adminJar, adminGroup.id);
  await testJwtRevocation(adminJar, fullGroup.id);
  await testSessionRevocation(adminJar, fullGroup.id, viewGroup.id);
  await testDuplicateNasIp(adminJar, fullGroup.id);
  await testEffectiveSettings(adminJar);
  await testRefreshBinding(adminJar, fullGroup.id);
  await testRadiusAttributeAllowlist(adminJar, fullGroup.id);
  await testHealthRateLimit();

  console.log("RESULT  P3 Bloco A+B+C+D aprovado");
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
