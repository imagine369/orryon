import { NextResponse } from "next/server";
import { clearAuthCookies } from "@/lib/server/auth-cookies";

/** POST /api/auth/logout — clears all session cookies. */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  clearAuthCookies(res);
  return res;
}
