import { NextResponse } from "next/server";

const FILES: Record<string, { filename: string; contentType: string }> = {
  mac: { filename: "Orryon-mac.dmg", contentType: "application/octet-stream" },
  windows: { filename: "Orryon-windows.exe", contentType: "application/octet-stream" },
  linux: { filename: "Orryon-linux.AppImage", contentType: "application/x-executable" },
};

const ENV_URL: Record<string, string | undefined> = {
  mac: process.env.DESKTOP_DOWNLOAD_MAC_URL || process.env.NEXT_PUBLIC_DESKTOP_DOWNLOAD_MAC,
  windows:
    process.env.DESKTOP_DOWNLOAD_WINDOWS_URL || process.env.NEXT_PUBLIC_DESKTOP_DOWNLOAD_WINDOWS,
  linux: process.env.DESKTOP_DOWNLOAD_LINUX_URL || process.env.NEXT_PUBLIC_DESKTOP_DOWNLOAD_LINUX,
};

async function externalDownloadOk(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    return res.ok;
  } catch {
    return false;
  }
}

async function resolveDownload(request: Request, platform: string) {
  const meta = FILES[platform];
  if (!meta) return { error: NextResponse.json({ error: "Unknown platform" }, { status: 400 }) };

  const external = ENV_URL[platform]?.trim();
  if (external) {
    if (await externalDownloadOk(external)) return { redirect: external };
    return {
      error: NextResponse.json(
        {
          error: "Mac installer URL is not reachable.",
          hint:
            "If the DMG is on a private GitHub repo, uploads are not public — host the file on a public URL (GitHub public repo, Vercel Blob, S3) and set DESKTOP_DOWNLOAD_MAC_URL or NEXT_PUBLIC_DESKTOP_DOWNLOAD_MAC in Vercel.",
          configuredUrl: external,
        },
        { status: 503 },
      ),
    };
  }

  if (process.env.NODE_ENV === "production") {
    return {
      error: NextResponse.json(
        {
          error: "Desktop installer is not configured for production yet.",
          hint: `Set DESKTOP_DOWNLOAD_${platform.toUpperCase()}_URL (or NEXT_PUBLIC_DESKTOP_DOWNLOAD_${platform.toUpperCase()}) to a public installer URL and redeploy.`,
        },
        { status: 503 },
      ),
    };
  }

  // Local dev: serve from `public/downloads/` (no fs — avoids Turbopack NFT tracing warnings).
  return { redirect: new URL(`/downloads/${meta.filename}`, request.url).toString() };
}

export async function HEAD(
  request: Request,
  context: { params: Promise<{ platform: string }> },
) {
  const { platform } = await context.params;
  const resolved = await resolveDownload(request, platform);
  if ("error" in resolved && resolved.error) return resolved.error;
  return NextResponse.redirect(resolved.redirect!, 302);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ platform: string }> },
) {
  const { platform } = await context.params;
  const resolved = await resolveDownload(request, platform);
  if ("error" in resolved && resolved.error) return resolved.error;
  return NextResponse.redirect(resolved.redirect!, 302);
}
