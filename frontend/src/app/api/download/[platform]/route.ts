import { NextResponse } from "next/server";
import {
  type DesktopDownloadPlatform,
  unreachableInstallerBody,
  unconfiguredInstallerBody,
} from "@/lib/desktop-download-api";

const FILES: Record<DesktopDownloadPlatform, { filename: string; contentType: string }> = {
  mac: { filename: "Orryon-mac.dmg", contentType: "application/octet-stream" },
  windows: { filename: "Orryon-windows.exe", contentType: "application/octet-stream" },
  linux: { filename: "Orryon-linux.AppImage", contentType: "application/x-executable" },
};

/** Prefer server-only env vars so installer URLs are not embedded in the client bundle. */
const ENV_URL: Record<DesktopDownloadPlatform, string | undefined> = {
  mac: process.env.DESKTOP_DOWNLOAD_MAC_URL,
  windows: process.env.DESKTOP_DOWNLOAD_WINDOWS_URL,
  linux: process.env.DESKTOP_DOWNLOAD_LINUX_URL,
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
  const meta = FILES[platform as DesktopDownloadPlatform];
  if (!meta) return { error: NextResponse.json({ error: "Unknown platform" }, { status: 400 }) };

  const desktopPlatform = platform as DesktopDownloadPlatform;
  const external = ENV_URL[desktopPlatform]?.trim();
  if (external) {
    if (await externalDownloadOk(external)) return { redirect: external };
    return {
      error: NextResponse.json(unreachableInstallerBody(desktopPlatform), { status: 503 }),
    };
  }

  if (process.env.NODE_ENV === "production") {
    return {
      error: NextResponse.json(unconfiguredInstallerBody(desktopPlatform), { status: 503 }),
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
