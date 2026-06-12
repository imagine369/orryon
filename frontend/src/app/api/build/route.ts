import { NextResponse } from "next/server";

/** Current deploy build id — polled by clients during active sessions. */
export async function GET() {
  const canary = process.env.NEXT_PUBLIC_CANARY || "orr-dev";
  return NextResponse.json(
    { canary },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
      },
    },
  );
}
