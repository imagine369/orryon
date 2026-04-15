import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const WAITLIST_FILE = path.join(process.cwd(), "waitlist.json");

function readWaitlist(): { email: string; joined_at: string }[] {
  try {
    if (!fs.existsSync(WAITLIST_FILE)) return [];
    return JSON.parse(fs.readFileSync(WAITLIST_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function saveWaitlist(list: { email: string; joined_at: string }[]) {
  fs.writeFileSync(WAITLIST_FILE, JSON.stringify(list, null, 2), "utf-8");
}

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    const clean = (email ?? "").trim().toLowerCase();

    if (!clean || !clean.includes("@") || !clean.split("@")[1]?.includes(".")) {
      return NextResponse.json({ error: "Invalid email." }, { status: 422 });
    }

    // Try FastAPI backend first (when it's running)
    const apiUrl = process.env.API_URL ?? "http://localhost:8000";
    try {
      const res = await fetch(`${apiUrl}/api/waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: clean }),
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const data = await res.json();
        return NextResponse.json(data, { status: 201 });
      }
    } catch {
      // Backend not available — fall through to local storage
    }

    // Local fallback: store in waitlist.json
    const list = readWaitlist();
    const exists = list.some((e) => e.email === clean);
    if (exists) {
      return NextResponse.json({ status: "already_on_waitlist" }, { status: 201 });
    }
    list.push({ email: clean, joined_at: new Date().toISOString() });
    saveWaitlist(list);

    return NextResponse.json({ status: "added" }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get("secret") ?? "";
  const adminSecret = process.env.ADMIN_SECRET ?? "";

  if (!adminSecret || secret !== adminSecret) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const list = readWaitlist();
  const csv = ["email,joined_at", ...list.map((e) => `${e.email},${e.joined_at}`)].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": "attachment; filename=waitlist.csv",
    },
  });
}
