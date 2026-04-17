import { NextRequest, NextResponse } from "next/server";

/**
 * Proxies `/api/*` to the FastAPI backend at request time (reads BACKEND_URL on Vercel).
 * More specific routes (`/api/contact`, `/api/waitlist`) take precedence.
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

function buildTargetUrl(req: NextRequest, pathSegments: string[] | undefined): string {
  const path = pathSegments?.length ? pathSegments.join("/") : "";
  const search = req.nextUrl.search;
  return `${backendBase()}/api/${path}${search}`;
}

function forwardRequestHeaders(req: NextRequest): Headers {
  const out = new Headers();
  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === "host") return;
    if (HOP_BY_HOP.has(lower)) return;
    out.set(key, value);
  });
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

async function proxy(req: NextRequest, pathSegments: string[] | undefined): Promise<NextResponse> {
  const url = buildTargetUrl(req, pathSegments);
  const headers = forwardRequestHeaders(req);
  const method = req.method;

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
