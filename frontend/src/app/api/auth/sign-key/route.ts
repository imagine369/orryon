import { NextRequest, NextResponse } from "next/server";
import {
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
 * POST /api/auth/sign-key — dedicated handler (like /api/auth/me) so session
 * cookies are read reliably before chat/voice HMAC signing can work.
 */
export async function POST(req: NextRequest) {
  const jwt = (await readSessionTokenFromStore()) ?? getSessionToken(req);

  if (!jwt) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${backendBase()}/api/auth/sign-key`, {
      method: "POST",
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
