import { NextRequest, NextResponse } from "next/server";

function backendBase(): string {
  return (
    process.env.BACKEND_URL ??
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://127.0.0.1:8000"
  ).replace(/\/$/, "");
}

/**
 * GET /api/calendar/google/callback — Google OAuth redirect target.
 *
 * Forwards the authorization code to the backend and passes the final redirect
 * (e.g. /home?calendar_connected=1) back to the browser.
 */
export async function GET(req: NextRequest) {
  const search = req.nextUrl.search;
  const url = `${backendBase()}/api/calendar/google/callback${search}`;

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: "GET",
      headers: { Origin: req.nextUrl.origin },
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
