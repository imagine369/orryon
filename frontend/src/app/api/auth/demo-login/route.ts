import { NextRequest, NextResponse } from "next/server";
import { isDemoRouteAllowed } from "@/lib/demo-mode-server";
import { makeCsrf, setAuthCookies } from "@/lib/server/auth-cookies";
import { checkRateLimit, tooManyRequests } from "@/lib/ratelimit";

/** POST /api/auth/demo-login — cookie-setting wrapper around FastAPI /api/auth/demo. */

function backendBase(): string {
  return (
    process.env.BACKEND_URL ??
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://127.0.0.1:8000"
  ).replace(/\/$/, "");
}

export async function POST(req: NextRequest) {
  if (!isDemoRouteAllowed(req)) {
    return NextResponse.json({ detail: "Not found" }, { status: 404 });
  }

  // 5 demo logins per IP per minute — demo mode is gated to NODE_ENV=local on
  // the backend anyway, but we still want to cap edge-level abuse.
  const rl = await checkRateLimit(req, { tier: "demo-login", limit: 5, windowSeconds: 60 });
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  let upstream: Response;
  try {
    upstream = await fetch(`${backendBase()}/api/auth/demo`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(req.headers.get("origin") ? { Origin: req.headers.get("origin")! } : {}),
      },
    });
  } catch {
    return NextResponse.json({ detail: "Upstream service unavailable." }, { status: 502 });
  }

  const data = (await upstream.json().catch(() => ({}))) as {
    token?: string;
    user?: unknown;
    detail?: string;
  };

  if (!upstream.ok || !data.token) {
    return NextResponse.json(
      { detail: data.detail || "Demo login failed" },
      { status: upstream.status || 403 },
    );
  }

  const res = NextResponse.json({ user: data.user });
  setAuthCookies(res, data.token, makeCsrf());
  return res;
}
