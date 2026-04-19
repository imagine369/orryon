/**
 * Client-side integrity gate.
 *
 * Verifies that the running bundle is hosted on an official Orryon origin. This
 * is deliberately lightweight — a determined attacker can patch it out — but it
 * kills the trivial clone vector of "download the JS bundle and re-host it
 * somewhere else". Combined with the server-side Origin enforcement in
 * `backend/middleware.py`, a cloned frontend also fails at the first API call.
 *
 * The canary (`NEXT_PUBLIC_CANARY`) is injected at build time in
 * `next.config.ts` and sent as `X-Orryon-Build` on every request, so we can
 * grep for verbatim bundle clones in the wild.
 */

export const CANARY: string = process.env.NEXT_PUBLIC_CANARY || "orr-dev";
export const BUILD_SHA: string = process.env.NEXT_PUBLIC_BUILD_SHA || "dev";

const ALLOWED_HOSTS = new Set<string>([
  "orryon.com",
  "www.orryon.com",
  "app.orryon.com",
  // Vercel preview deployments: keep the suffix check for *.vercel.app, handled below.
  "localhost",
  "127.0.0.1",
]);

export function isAllowedHost(hostname: string): boolean {
  if (ALLOWED_HOSTS.has(hostname)) return true;
  if (hostname.endsWith(".vercel.app")) return true;          // preview builds
  if (hostname.endsWith(".orryon.com")) return true;          // sub-envs
  return false;
}

/**
 * Throws if the current origin is not an official Orryon deployment.
 * Caller should render a branded "not an official deployment" screen on throw.
 */
export function assertTrustedHost(): void {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV !== "production") return;
  const host = window.location.hostname;
  if (!isAllowedHost(host)) {
    throw new Error(`untrusted-host:${host}`);
  }
}
