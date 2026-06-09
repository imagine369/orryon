/**
 * Server-side helpers for the HttpOnly session cookie + double-submit CSRF
 * cookie. Kept in one place so the proxy, the login route, and the logout
 * route all agree on names, flags, and lifetimes.
 */

import { cookies as nextCookies } from "next/headers";
import type { NextResponse } from "next/server";

export const SESSION_COOKIE = "orryon_session";
export const CSRF_COOKIE = "orryon_csrf";
// Non-HttpOnly signal that an active session exists. Lets the client skip the
// unauthenticated /auth/me round-trip on cold start without exposing the JWT.
export const SIGNAL_COOKIE = "orryon_auth";

export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days — matches backend JWT_EXPIRY_DAYS

const IS_PROD = process.env.NODE_ENV === "production";

/** Share session cookies across www.orryon.com and orryon.com (host-only cookies break that). */
export function cookieDomainForHost(host: string | undefined): string | undefined {
  if (!host) return undefined;
  const h = host.split(":")[0].toLowerCase();
  if (h === "orryon.com" || h.endsWith(".orryon.com")) return ".orryon.com";
  return undefined;
}

/** 32 bytes of base64url randomness for the CSRF token. */
export function makeCsrf(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

/**
 * Read the session JWT from the incoming request, whichever way it was sent:
 *  1. the HttpOnly `orryon_session` cookie (preferred; set by login route)
 *  2. an existing `Authorization: Bearer ...` header (legacy localStorage path)
 */
export function getSessionToken(req: Request): string | null {
  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader.match(/(?:^|;\s*)orryon_session=([^;]+)/);
  if (match) return decodeURIComponent(match[1]);
  const auth = req.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return null;
}

export function getCsrfCookie(req: Request): string | null {
  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader.match(/(?:^|;\s*)orryon_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function cookieBase(host: string | undefined) {
  const domain = cookieDomainForHost(host);
  return {
    secure: IS_PROD,
    sameSite: "lax" as const,
    path: "/",
    ...(domain ? { domain } : {}),
  };
}

/** Attach the three auth cookies to a NextResponse. */
export function setAuthCookies(
  res: NextResponse,
  jwt: string,
  csrf: string,
  host?: string,
): void {
  const base = cookieBase(host);
  res.cookies.set(SESSION_COOKIE, jwt, {
    ...base,
    httpOnly: true,
    maxAge: SESSION_MAX_AGE,
  });
  res.cookies.set(CSRF_COOKIE, csrf, {
    ...base,
    httpOnly: false,
    maxAge: SESSION_MAX_AGE,
  });
  res.cookies.set(SIGNAL_COOKIE, "1", {
    ...base,
    httpOnly: false,
    maxAge: SESSION_MAX_AGE,
  });
}

export function clearAuthCookies(res: NextResponse, host?: string): void {
  const base = cookieBase(host);
  for (const name of [SESSION_COOKIE, CSRF_COOKIE, SIGNAL_COOKIE]) {
    res.cookies.set(name, "", {
      ...base,
      httpOnly: name === SESSION_COOKIE,
      maxAge: 0,
    });
  }
}

/**
 * Look up a cookie on the current request (for route handlers that don't have
 * direct access to the Request object).
 */
export async function readCookie(name: string): Promise<string | null> {
  const store = await nextCookies();
  return store.get(name)?.value ?? null;
}
