import type { NextConfig } from "next";
import path from "node:path";
import { withSentryConfig } from "@sentry/nextjs";
import withPWA from "@ducanh2912/next-pwa";

// ── Content Security Policy ──────────────────────────────────────────────────
// Allowlist-based (not nonce-based) so we don't need per-request middleware or
// force pages into dynamic rendering. Opened only where specific deps require:
//  - `'unsafe-inline'` on script-src is required because Next.js App Router
//    embeds React Server Component payloads as inline <script> tags. Without it
//    (and without nonce-based CSP) the page fails to hydrate in production.
//  - `'wasm-unsafe-eval'` covers wasm-heavy clients (sqlite-wasm, TF, etc.)
//  - `'unsafe-inline'` on style-src is unavoidable while using Tailwind JIT
//    and inline `style` props in React components.
//  - Sentry needs `*.sentry.io` for script + connect and `browser.sentry-cdn.com`
//    for their loader.
//  - `connect-src` covers our same-origin API proxy plus the backend host when
//    NEXT_PUBLIC_API_URL is set (WebSocket chat bypasses the Next proxy).
const IS_DEV = process.env.NODE_ENV !== "production";
const backendApi = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
const backendWs = backendApi.replace(/^http/, "ws");

// Next.js dev mode relies on inline scripts and eval() for HMR / React Refresh
// / error overlay, so a strict script-src would break `npm run dev` entirely.
// We relax script/style/connect to the minimum needed only in development;
// production keeps the allowlist tight.
const cspDirectives: Record<string, string[]> = {
  "default-src": ["'self'"],
  "script-src": [
    "'self'",
    "'unsafe-inline'",
    "'wasm-unsafe-eval'",
    "https://*.sentry.io",
    "https://browser.sentry-cdn.com",
    ...(IS_DEV ? ["'unsafe-eval'"] : []),
  ],
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": ["'self'", "data:", "blob:", "https:"],
  "font-src": ["'self'", "data:"],
  "connect-src": [
    "'self'",
    "https://*.sentry.io",
    "https://o.ingest.sentry.io",
    ...(backendApi ? [backendApi] : []),
    ...(backendWs ? [backendWs] : []),
    // Dev server / React Refresh uses ws: to push HMR events.
    ...(IS_DEV ? ["ws://localhost:*", "ws://127.0.0.1:*", "http://localhost:*", "http://127.0.0.1:*"] : []),
  ],
  "media-src": ["'self'", "blob:"],
  "worker-src": ["'self'", "blob:"],
  "frame-ancestors": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
  "object-src": ["'none'"],
  ...(IS_DEV ? {} : { "upgrade-insecure-requests": [] }),
};

const csp = Object.entries(cspDirectives)
  .map(([k, v]) => (v.length ? `${k} ${v.join(" ")}` : k))
  .join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  // Skip HSTS in dev — pinning https on localhost breaks later http access
  // from the same browser for up to two years.
  ...(IS_DEV
    ? []
    : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-site" },
];

// Build-time canary so we can trace any re-hosted bundle back to the commit
// that shipped it. Surfaced to the client via NEXT_PUBLIC_* env vars and sent
// on every request as `X-Orryon-Build`.
const BUILD_SHA = (process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || "dev").slice(0, 12);
const CANARY = `orr-${BUILD_SHA}`;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  // Monorepo: lockfile at repo root would otherwise make Turbopack resolve from parent (missing tailwindcss).
  turbopack: { root: path.resolve(process.cwd()) },
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
    reactRemoveProperties: { properties: ["^data-testid$"] },
  },
  env: {
    NEXT_PUBLIC_BUILD_SHA: BUILD_SHA,
    NEXT_PUBLIC_CANARY: CANARY,
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  // API proxy: `app/api/[[...path]]/route.ts` (runtime BACKEND_URL), not rewrites (build-time).
};

const pwaConfig = withPWA({
  dest: "public",
  register: true,
  disable: process.env.NODE_ENV === "development",
})(nextConfig);

export default withSentryConfig(pwaConfig, {
  silent: true,
  disableLogger: true,

  // Source map uploads (only when SENTRY_AUTH_TOKEN is set)
  ...(process.env.SENTRY_AUTH_TOKEN && {
    org: "orryon",
    project: "orryon-frontend",
    authToken: process.env.SENTRY_AUTH_TOKEN,
  }),
});
