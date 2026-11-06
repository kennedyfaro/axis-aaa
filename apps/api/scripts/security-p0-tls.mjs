import { authenticator } from "otplib";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const BASE = process.env.SECURITY_TLS_BASE_URL ?? "https://nginx/api/v1";
const HTTP_BASE = process.env.SECURITY_TLS_HTTP_URL ?? "http://nginx/api/v1";

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS  ${message}`);
}

async function main() {
  const health = await fetch(`${BASE}/health`);
  assert(health.ok, "health responde via HTTPS");
  const hsts = health.headers.get("strict-transport-security");
  assert(hsts?.includes("max-age=31536000"), "HSTS presente na resposta HTTPS");

  const redirect = await fetch(`${HTTP_BASE}/health`, { redirect: "manual" });
  assert(redirect.status === 301, "HTTP redireciona com 301");
  assert(
    (redirect.headers.get("location") ?? "").startsWith("https://"),
    "redirecionamento aponta para HTTPS",
  );

  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const secret = process.env.BOOTSTRAP_ADMIN_TOTP_SECRET;
  assert(email && password && secret, "credenciais de bootstrap disponíveis");

  const first = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const firstBody = await first.json();
  assert(first.status === 200 && firstBody.mfaRequired, "login via HTTPS aceito");

  const second = await fetch(`${BASE}/auth/mfa`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      challengeId: firstBody.challengeId,
      code: authenticator.generate(secret),
    }),
  });
  assert(second.status === 200, "MFA via HTTPS aceito");

  const cookies = second.headers.getSetCookie?.() ?? [];
  const access = cookies.find((cookie) => cookie.startsWith("aaa_access="));
  const refresh = cookies.find((cookie) => cookie.startsWith("aaa_refresh="));
  const csrf = cookies.find((cookie) => cookie.startsWith("aaa_csrf="));

  assert(access?.includes("Secure"), "cookie de acesso tem Secure");
  assert(access?.includes("HttpOnly"), "cookie de acesso tem HttpOnly");
  assert(access?.toLowerCase().includes("samesite=lax"), "cookie de acesso tem SameSite=Lax");
  assert(refresh?.includes("Secure"), "cookie de refresh tem Secure");
  assert(refresh?.includes("HttpOnly"), "cookie de refresh tem HttpOnly");
  assert(csrf?.includes("Secure"), "cookie CSRF tem Secure");
  assert(!csrf?.includes("HttpOnly"), "cookie CSRF é legível pelo frontend");

  console.log("RESULT  P0 AX-005 aprovado");
}

await main();
