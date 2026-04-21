import { NextRequest, NextResponse } from "next/server";

const PROTECTED_PATHS = ["/home", "/settings"];
const AUTH_SIGNAL_COOKIE = "orryon_auth";
const SESSION_COOKIE = "orryon_session";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const hasSignal = request.cookies.has(AUTH_SIGNAL_COOKIE);
  const hasSession = request.cookies.has(SESSION_COOKIE);

  if (PROTECTED_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    if (!hasSignal && !hasSession) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  if (pathname === "/login" && (hasSignal || hasSession)) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/home";
    return NextResponse.redirect(homeUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/home/:path*", "/settings/:path*", "/login"],
};
