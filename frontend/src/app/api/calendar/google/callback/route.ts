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
 * Google always redirects here with ?code=&state=. We POST those once to the
 * backend so the one-time authorization code is not consumed by a duplicated
 * GET proxy hop (which surfaces as invalid_grant).
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code") ?? "";
  const state = req.nextUrl.searchParams.get("state") ?? "";
  if (!code || !state) {
    return NextResponse.json(
      { detail: "Missing code or state from Google." },
      { status: 400 },
    );
  }

  const url = `${backendBase()}/api/calendar/google/callback`;

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Origin: req.nextUrl.origin,
      },
      body: JSON.stringify({ code, state }),
      redirect: "manual",
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ detail: "Backend unreachable." }, { status: 502 });
  }

  // Preferred: JSON { redirect: "https://.../home?..." }
  const contentType = upstream.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const data = (await upstream.json()) as { redirect?: string; detail?: string };
      if (data.redirect) {
        return NextResponse.redirect(data.redirect, 302);
      }
      return NextResponse.json(data, { status: upstream.status });
    } catch {
      return NextResponse.json({ detail: "Invalid backend response." }, { status: 502 });
    }
  }

  const location = upstream.headers.get("location");
  if (location && upstream.status >= 300 && upstream.status < 400) {
    return NextResponse.redirect(location, upstream.status);
  }

  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: {
      "content-type": contentType || "application/json",
    },
  });
}
