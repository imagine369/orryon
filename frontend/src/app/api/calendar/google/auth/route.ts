import { NextRequest, NextResponse } from "next/server";
import { getSessionToken, readSessionTokenFromStore } from "@/lib/server/auth-cookies";

function backendBase(): string {
  return (
    process.env.BACKEND_URL ??
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://127.0.0.1:8000"
  ).replace(/\/$/, "");
}

/**
 * GET /api/calendar/google/auth — start Google OAuth.
 *
 * Reads the HttpOnly session cookie and forwards it as Bearer to the backend.
 * Uses redirect: "manual" so the browser receives Google's OAuth URL instead of
 * the proxy following the redirect server-side.
 */
export async function GET(req: NextRequest) {
  const jwt = (await readSessionTokenFromStore()) ?? getSessionToken(req);
  if (!jwt) {
    return NextResponse.json({ detail: "Missing or invalid token." }, { status: 401 });
  }

  const search = req.nextUrl.search;
  const url = `${backendBase()}/api/calendar/google/auth${search}`;

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${jwt}` },
      redirect: "manual",
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ detail: "Backend unreachable." }, { status: 502 });
  }

  const location = upstream.headers.get("location");
  if (location && upstream.status >= 300 && upstream.status < 400) {
    return NextResponse.redirect(location, upstream.status);
  }

  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
    },
  });
}
