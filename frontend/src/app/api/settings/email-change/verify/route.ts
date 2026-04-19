import { NextRequest, NextResponse } from "next/server";
import {
  getCsrfCookie,
  getSessionToken,
  makeCsrf,
  setAuthCookies,
} from "@/lib/server/auth-cookies";

/**
 * POST /api/settings/email-change/verify
 *
 * Intercepts the upstream response so the new JWT never leaves the server:
 * we re-set `orryon_session` + `orryon_csrf` cookies with the rotated token
 * and return only `{ email }` to the browser.
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
  // Double-submit CSRF — must match the regular proxy's behavior.
  const headerToken = req.headers.get("x-csrf-token") || "";
  const cookieToken = getCsrfCookie(req) || "";
  if (!headerToken || !cookieToken || headerToken !== cookieToken) {
    return NextResponse.json({ detail: "CSRF check failed" }, { status: 403 });
  }

  const jwt = getSessionToken(req);
  if (!jwt) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });

  const rawBody = await req.arrayBuffer();

  let upstream: Response;
  try {
    upstream = await fetch(`${backendBase()}/api/settings/email-change/verify`, {
      method: "POST",
      headers: {
        "Content-Type": req.headers.get("content-type") || "application/json",
        Authorization: `Bearer ${jwt}`,
        ...(req.headers.get("origin") ? { Origin: req.headers.get("origin")! } : {}),
      },
      body: rawBody,
    });
  } catch {
    return NextResponse.json({ detail: "Upstream service unavailable." }, { status: 502 });
  }

  const data = (await upstream.json().catch(() => ({}))) as {
    token?: string;
    email?: string;
    detail?: string;
  };

  if (!upstream.ok) {
    return NextResponse.json(
      { detail: data.detail || "Verification failed" },
      { status: upstream.status },
    );
  }

  const res = NextResponse.json({ email: data.email });
  if (data.token) {
    setAuthCookies(res, data.token, makeCsrf());
  }
  return res;
}
