import { NextRequest, NextResponse } from "next/server";
import {
  CSRF_COOKIE,
  SESSION_COOKIE,
  SIGNAL_COOKIE,
  getCsrfCookie,
  getSessionToken,
} from "@/lib/server/auth-cookies";

/**
 * Runtime proxy for every `/api/*` request not handled by a more specific
 * route (`/api/auth/login`, `/api/auth/logout`, `/api/auth/demo-login`,
 * `/api/settings/email-change/verify`). Responsibilities:
 *
 *  1. Translate the HttpOnly `orryon_session` cookie into an
 *     `Authorization: Bearer` header for the FastAPI backend. The backend
 *     still only ever speaks Bearer — it never has to know we moved the JWT
 *     off JS.
 *  2. Enforce double-submit CSRF for mutating methods when the caller is
 *     authenticated via cookie. The cookie `orryon_csrf` must match the
 *     `X-CSRF-Token` header. `Authorization`-only callers (legacy mobile)
 *     bypass this — they already proved they hold the bearer token.
 *  3. Strip Orryon-internal cookies before forwarding so the backend never
 *     sees our session cookie (defence-in-depth if logs ever leak).
 */
function backendBase(): string {
  return (
    process.env.BACKEND_URL ??
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://127.0.0.1:8000"
  ).replace(/\/$/, "");
}

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);

const ORRYON_COOKIES = new Set([SESSION_COOKIE, CSRF_COOKIE, SIGNAL_COOKIE]);

function buildTargetUrl(req: NextRequest, pathSegments: string[] | undefined): string {
  const path = pathSegments?.length ? pathSegments.join("/") : "";
  const search = req.nextUrl.search;
  return `${backendBase()}/api/${path}${search}`;
}

/**
 * Remove Orryon's own cookies from the outgoing Cookie header; pass any
 * third-party cookies through unchanged (there shouldn't be any, but this is
 * defence-in-depth).
 */
function sanitizeCookieHeader(raw: string | null): string | null {
  if (!raw) return null;
  const kept = raw
    .split(";")
    .map((c) => c.trim())
    .filter((c) => {
      const eq = c.indexOf("=");
      const name = eq === -1 ? c : c.slice(0, eq);
      return !ORRYON_COOKIES.has(name);
    });
  return kept.length ? kept.join("; ") : null;
}

function forwardRequestHeaders(req: NextRequest, bearer: string | null): Headers {
  const out = new Headers();
  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === "host") return;
    if (lower === "cookie") return; // re-added below, sanitized
    if (lower === "authorization") return; // replaced below
    if (lower === "x-csrf-token") return; // internal-only
    if (HOP_BY_HOP.has(lower)) return;
    out.set(key, value);
  });
  const cookie = sanitizeCookieHeader(req.headers.get("cookie"));
  if (cookie) out.set("cookie", cookie);
  if (bearer) out.set("authorization", `Bearer ${bearer}`);
  return out;
}

function forwardResponseHeaders(res: Response): Headers {
  const out = new Headers();
  res.headers.forEach((value, key) => {
    if (HOP_BY_HOP.has(key.toLowerCase())) return;
    out.set(key, value);
  });
  return out;
}

function isMutating(method: string): boolean {
  const m = method.toUpperCase();
  return m !== "GET" && m !== "HEAD" && m !== "OPTIONS";
}

async function proxy(req: NextRequest, pathSegments: string[] | undefined): Promise<NextResponse> {
  const method = req.method;
  const jwt = getSessionToken(req);

  // Double-submit CSRF: only enforced when auth came from cookie. A legacy
  // client sending `Authorization: Bearer` directly (Capacitor mobile) will
  // not have an orryon_csrf cookie and is not subject to this check — the
  // bearer token itself proves intent.
  // Auth endpoints (send-code, verify) are pre-authentication — exempt them
  // so a stale orryon_session cookie from a previous session never blocks login.
  const pathStr = pathSegments?.join("/") ?? "";
  const isAuthEndpoint = pathStr === "auth/send-code" || pathStr === "auth/verify";
  const viaCookie = !!req.headers.get("cookie")?.match(/(?:^|;\s*)orryon_session=/);
  if (viaCookie && isMutating(method) && !isAuthEndpoint) {
    const expected = getCsrfCookie(req);
    const got = req.headers.get("x-csrf-token");
    if (!expected || !got || expected !== got) {
      return NextResponse.json({ detail: "CSRF check failed" }, { status: 403 });
    }
  }

  const url = buildTargetUrl(req, pathSegments);
  const headers = forwardRequestHeaders(req, jwt);

  let body: BodyInit | undefined;
  if (method !== "GET" && method !== "HEAD") {
    body = await req.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, { method, headers, body });
  } catch {
    return NextResponse.json(
      {
        detail:
          "Backend unreachable. Set BACKEND_URL on Vercel to your Railway API URL (e.g. https://….up.railway.app).",
      },
      { status: 502 },
    );
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: forwardResponseHeaders(upstream),
  });
}

type RouteCtx = { params: Promise<{ path?: string[] }> };

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function PUT(req: NextRequest, ctx: RouteCtx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function OPTIONS(req: NextRequest, ctx: RouteCtx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
