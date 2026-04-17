import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, subject, message } = body ?? {};

    // Basic client-side guard before hitting the backend
    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required." }, { status: 422 });
    }
    if (!email?.trim() || !email.includes("@")) {
      return NextResponse.json({ error: "A valid email address is required." }, { status: 422 });
    }
    if (!subject?.trim()) {
      return NextResponse.json({ error: "Subject is required." }, { status: 422 });
    }
    if (!message?.trim()) {
      return NextResponse.json({ error: "Message is required." }, { status: 422 });
    }

    const apiUrl =
      process.env.BACKEND_URL ??
      process.env.API_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      "http://127.0.0.1:8000";

    const res = await fetch(`${apiUrl}/api/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        subject: subject.trim(),
        message: message.trim(),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: data.detail ?? "Failed to send your message. Please try again." },
        { status: res.status }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[/api/contact] Unexpected error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again later." },
      { status: 500 }
    );
  }
}
