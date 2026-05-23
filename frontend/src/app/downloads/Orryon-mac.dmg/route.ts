import { NextResponse } from "next/server";

/** Permanent redirect for bookmarks / old release links. */
export function GET(request: Request) {
  return NextResponse.redirect(new URL("/api/download/mac", request.url), 308);
}

export function HEAD(request: Request) {
  return NextResponse.redirect(new URL("/api/download/mac", request.url), 308);
}
