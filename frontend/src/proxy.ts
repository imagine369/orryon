import { NextRequest, NextResponse } from "next/server";

// ── Content Security Policy ──────────────────────────────────────────────────
// Per-request nonce + `'strict-dynamic'`. Next.js (≥13.4) auto-injects the nonce
// into every `<script>` it emits when it sees a `Content-Security-Policy`
// header on the incoming request, and `strict-dynamic` lets those trusted
// scripts load their chunks without listing every host. This eliminates the
// `'unsafe-inline'` in script-src that security scanners flag.
//
// Dev mode keeps a relaxed CSP (unsafe-eval for HMR, unsafe-inline fallback)
// because Next's dev runtime uses eval() and some inline scripts without
// nonces. Production is strict.

const IS_DEV = process.env.NODE_ENV !== "production";
const backendApi = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
const backendWs = backendApi.replace(/^http/, "ws");

function buildCsp(nonce: string): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": IS_DEV
      ? [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          "'wasm-unsafe-eval'",
          "https://*.sentry.io",
          "https://browser.sentry-cdn.com",
        ]
      : [
          "'self'",
          `'nonce-${nonce}'`,
          "'strict-dynamic'",
          "'wasm-unsafe-eval'",
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
      ...(IS_DEV
        ? ["ws://localhost:*", "ws://127.0.0.1:*", "http://localhost:*", "http://127.0.0.1:*"]
        : []),
    ],
    "media-src": ["'self'", "blob:"],
    "worker-src": ["'self'", "blob:"],
    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "object-src": ["'none'"],
    ...(IS_DEV ? {} : { "upgrade-insecure-requests": [] }),
  };

  return Object.entries(directives)
    .map(([k, v]) => (v.length ? `${k} ${v.join(" ")}` : k))
    .join("; ");
}

export function proxy(request: NextRequest) {
  // Web Crypto is available in the Edge runtime; avoid Node's Buffer.
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  // Next.js reads this to auto-attach the nonce to every <script> it renders.
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Exclude API routes and static assets. Also skip prefetches so we don't
    // bust the Next router's prefetch cache with a per-request CSP header.
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|manifest.json|icon-.*\\.png|apple-touch-icon\\.png|avatar\\.png|og-image\\.png|downloads/.*|sw\\.js|workbox-.*\\.js).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
