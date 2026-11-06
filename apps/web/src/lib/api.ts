export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

const NO_REFRESH = ["/auth/login", "/auth/mfa", "/auth/refresh", "/auth/logout"];

function csrfToken(): string | undefined {
  if (typeof document === "undefined") return undefined;
  return document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith("aaa_csrf="))
    ?.slice("aaa_csrf=".length);
}

let refreshing: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = fetch("/api/v1/auth/refresh", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
    })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

export async function apiFetch<T>(path: string, init?: RequestInit, retried = false): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    const token = csrfToken();
    if (token) headers.set("X-CSRF-Token", token);
  }

  const response = await fetch(`/api/v1${path}`, {
    ...init,
    method,
    headers,
    credentials: "include",
    cache: "no-store",
  });

  if (response.status === 401 && !retried && !NO_REFRESH.some((prefix) => path.startsWith(prefix))) {
    if (await refreshSession()) {
      return apiFetch<T>(path, init, true);
    }
  }

  if (!response.ok) {
    let message = "Não foi possível concluir a operação.";
    let details: unknown;
    try {
      const body = await response.json();
      message = body.message ?? message;
      details = body.details;
    } catch {
      // resposta sem corpo JSON
    }
    throw new ApiError(message, response.status, details);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function download(path: string) {
  const link = document.createElement("a");
  link.href = `/api/v1${path}`;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}
