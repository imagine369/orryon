import { NextResponse } from "next/server";
import { clearAuthCookies, getSessionToken } from "@/lib/server/auth-cookies";

/** POST /api/auth/logout — revokes the server session, then clears cookies. */
export async function POST(req: Request) {
  const jwt = getSessionToken(req);

  // Best-effort: tell the backend to revoke this session server-side
  if (jwt) {
    const apiUrl =
      process.env.BACKEND_URL ||
      process.env.API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      "http://127.0.0.1:8000";
    try {
      await fetch(`${apiUrl}/api/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      });
    } catch {
      // Backend may be down — still clear cookies so the user can log out
    }
  }

  const res = NextResponse.json({ ok: true });
  clearAuthCookies(res);
  return res;
}
