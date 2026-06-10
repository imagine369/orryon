/** Auth token, cookie, and CSRF helpers for API requests. */

export function getLegacyToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("orryon_token");
}

export function setToken(_token: string) {
  /* no-op: JWT is set as an HttpOnly cookie by /api/auth/login */
}

export function clearToken() {
  if (typeof window !== "undefined") localStorage.removeItem("orryon_token");
}

/** @deprecated Use `hasAuthSignal()` instead. Kept for back-compat. */
export function hasToken(): boolean {
  if (typeof window === "undefined") return false;
  return hasAuthSignal() || !!localStorage.getItem("orryon_token");
}

export function hasAuthSignal(): boolean {
  if (typeof document === "undefined") return false;
  return /(?:^|;\s*)orryon_auth=1/.test(document.cookie);
}

export { isDemoMode } from "./demo-mode";

export function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const matches = [...document.cookie.matchAll(/(?:^|;\s*)orryon_csrf=([^;]+)/g)];
  if (matches.length === 0) return null;
  return decodeURIComponent(matches[matches.length - 1][1]);
}
