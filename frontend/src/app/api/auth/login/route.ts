import { NextRequest, NextResponse } from "next/server";
import { makeCsrf, setAuthCookies } from "@/lib/server/auth-cookies";
import { checkRateLimit, tooManyRequests } from "@/lib/ratelimit";

/**
 * POST /api/auth/login
 *
 * Trades an OTP code for an HttpOnly session cookie. The browser never sees
 * the JWT — it's stored in `orryon_session` (HttpOnly, Secure, SameSite=Lax).
 * A matching `orryon_csrf` cookie is readable by client JS and echoed back in
 * the `X-CSRF-Token` header for mutating requests (double-submit pattern).
 *
 * Body: `{ email: string, code: string, display_name?: string }`
 * Returns: `{ user: User }` (no token).
 */

function backendBase(): string {
  return (
    process.env.BACKEND_URL ??
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://127.0.0.1:8000"
  ).replace(/\/$/, "");
}

export async function POST(req: NextRequest) {
  // 10 OTP redemption attempts per IP per minute. Tight enough to make
  // brute-forcing a 6-digit code impractical (10⁶ / 10·60 ≈ 1.9 years),
  // generous enough to tolerate a typo or two.
  const rl = await checkRateLimit(req, { tier: "login", limit: 10, windowSeconds: 60 });
  if (!rl.ok) return tooManyRequests(rl.retryAfter, "Too many login attempts. Please wait a moment.");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "Invalid JSON" }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${backendBase()}/api/auth/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Forward the caller's origin so the backend's origin middleware
        // treats this the same as a direct browser call.
        ...(req.headers.get("origin") ? { Origin: req.headers.get("origin")! } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    return NextResponse.json(
      { detail: "Upstream service unavailable." },
      { status: 502 },
    );
  }

  const data = (await upstream.json().catch(() => ({}))) as {
    token?: string;
    user?: unknown;
    detail?: string;
  };

  if (!upstream.ok || !data.token) {
    return NextResponse.json(
      { detail: data.detail || "Login failed" },
      { status: upstream.status || 401 },
    );
  }

  const res = NextResponse.json({ user: data.user });
  setAuthCookies(res, data.token, makeCsrf(), req.headers.get("host") ?? undefined);
  return res;
}
