import { NextRequest, NextResponse } from "next/server";

/**
 * Thin proxy for the public waitlist signup. The real implementation lives
 * on the FastAPI backend at `POST /api/waitlist` — it writes to SQLite,
 * applies per-IP and global rate limits, and fires the admin notification
 * email. Previously this route had a `fs.writeFileSync` "local fallback"
 * which (a) silently swallowed backend errors, (b) wrote to an ephemeral
 * path that's read-only in the Railway Next.js standalone build, and
 * (c) produced records that never reached the DB so the user couldn't
 * actually sign in later. All of that is gone — a failure now surfaces
 * as a real HTTP error the client can react to.
 *
 * Admin CSV export used to be served from this same file (reading the
 * local JSON). That's now handled by the backend at
 * `GET /api/admin/waitlist?secret=…`, which is reachable through the
 * catch-all proxy in `src/app/api/[[...path]]/route.ts`.
 */

// Must match the env-var chain used by `src/app/api/[[...path]]/route.ts`
// so a single `BACKEND_URL` / `API_URL` / `NEXT_PUBLIC_API_URL` setting on
// the frontend service works everywhere. The old hard-coded `API_URL`-only
// lookup is what caused this route to silently fall back to localhost on
// Railway (where only `NEXT_PUBLIC_API_URL` is set per DEPLOY.md).
function backendBase(): string {
  return (
    process.env.BACKEND_URL ??
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://127.0.0.1:8000"
  ).replace(/\/$/, "");
}

export async function POST(req: NextRequest) {
  let email: string;
  try {
    const body = await req.json();
    email = (body?.email ?? "").toString().trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!email || !email.includes("@") || !email.split("@")[1]?.includes(".")) {
    return NextResponse.json({ error: "Invalid email." }, { status: 422 });
  }

  const url = `${backendBase()}/api/waitlist`;
  let upstream: Response;
  try {
    // 10 s is long enough to ride out a Railway cold start but short enough
    // that a genuinely broken backend still surfaces quickly to the user.
    upstream = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    console.error("[waitlist] backend unreachable", { url, err });
    return NextResponse.json(
      { error: "Waitlist service is unavailable. Please try again in a moment." },
      { status: 502 },
    );
  }

  const text = await upstream.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { detail: text };
  }

  if (!upstream.ok) {
    console.error("[waitlist] backend rejected signup", {
      status: upstream.status,
      payload,
    });
  }

  return NextResponse.json(payload, { status: upstream.status });
}
