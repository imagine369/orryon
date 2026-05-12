import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import withPWA from "@ducanh2912/next-pwa";
// Content-Security-Policy is set per-request in `src/middleware.ts` (nonce +
// strict-dynamic) so Next.js can auto-attach the nonce to its inline script
// tags. Everything below is static and safe to serve from the edge.
const IS_DEV = process.env.NODE_ENV !== "production";

const securityHeaders = [
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
