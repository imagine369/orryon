import { NextRequest, NextResponse } from "next/server";
import {
  getCsrfCookie,
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

async function sessionJwt(req: NextRequest): Promise<string | null> {
  return (await readSessionTokenFromStore()) ?? getSessionToken(req);
}

/**
 * GET /api/settings — dedicated handler (same cookie strategy as /api/auth/me).
 */
export async function GET(req: NextRequest) {
  const jwt = await sessionJwt(req);
  if (!jwt) {
    return NextResponse.json(
      { detail: "Missing authorization header" },
      { status: 401 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${backendBase()}/api/settings`, {
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
  return NextResponse.json(data, { status: upstream.status });
}

/**
 * PATCH /api/settings — forwards profile updates with CSRF + session cookie.
 */
export async function PATCH(req: NextRequest) {
  const jwt = await sessionJwt(req);
  if (!jwt) {
    return NextResponse.json(
      { detail: "Missing authorization header" },
      { status: 401 },
    );
  }

  const viaCookie = !!req.headers.get("cookie")?.match(/(?:^|;\s*)orryon_session=/);
  if (viaCookie) {
    const expected = getCsrfCookie(req);
    const got = req.headers.get("x-csrf-token");
    if (!expected || !got || expected !== got) {
      return NextResponse.json({ detail: "CSRF check failed" }, { status: 403 });
    }
  }

  const body = await req.arrayBuffer();

  let upstream: Response;
  try {
    upstream = await fetch(`${backendBase()}/api/settings`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
        "X-Orryon-Client": "web",
      },
      body,
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { detail: "Backend unreachable." },
      { status: 502 },
    );
  }

  const data = await upstream.json().catch(() => ({}));
  return NextResponse.json(data, { status: upstream.status });
}
