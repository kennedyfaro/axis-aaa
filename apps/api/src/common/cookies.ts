import type { CookieOptions, Response } from "express";

export const ACCESS_COOKIE = "aaa_access";
export const REFRESH_COOKIE = "aaa_refresh";
export const CSRF_COOKIE = "aaa_csrf";

interface CookieSettings {
  secure: boolean;
  accessMaxAgeMs: number;
  refreshMaxAgeMs: number;
}

function base(secure: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
  };
}

export function setAuthCookies(
  response: Response,
  tokens: { accessToken: string; refreshToken: string; csrfToken: string },
  settings: CookieSettings,
) {
  response.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...base(settings.secure),
    maxAge: settings.accessMaxAgeMs,
  });
  response.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...base(settings.secure),
    path: "/api/v1/auth",
    maxAge: settings.refreshMaxAgeMs,
  });
  response.cookie(CSRF_COOKIE, tokens.csrfToken, {
    httpOnly: false,
    secure: settings.secure,
    sameSite: "lax",
    path: "/",
    maxAge: settings.accessMaxAgeMs,
  });
}

export function clearAuthCookies(response: Response) {
  response.clearCookie(ACCESS_COOKIE, { path: "/" });
  response.clearCookie(REFRESH_COOKIE, { path: "/api/v1/auth" });
  response.clearCookie(CSRF_COOKIE, { path: "/" });
}
