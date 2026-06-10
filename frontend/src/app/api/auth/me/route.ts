import { NextRequest, NextResponse } from "next/server";
import {
  ensureCsrfCookie,
  getSessionToken,
  readSessionTokenFromStore,
} from "@/lib/server/auth-cookies";

function backendBase(): string {
  return (
    process.env.BACKEND_URL ??
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://127.0.0.1:8000"
  ).replace(/\/$/, "");
}

/**
 * GET /api/auth/me — dedicated handler so session cookies are read via the
 * Next.js cookies API (more reliable than regex on the raw Cookie header).
 */
export async function GET(req: NextRequest) {
  const jwt =
    (await readSessionTokenFromStore()) ?? getSessionToken(req);

  if (!jwt) {
    return NextResponse.json(
      { detail: "Missing authorization header" },
      { status: 401 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${backendBase()}/api/auth/me`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "X-Orryon-Client": "web",
      },
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { detail: "Backend unreachable." },
      { status: 502 },
    );
  }

  const data = await upstream.json().catch(() => ({}));
  const res = NextResponse.json(data, { status: upstream.status });
  if (upstream.ok) {
    ensureCsrfCookie(res, req);
  }
  return res;
}
