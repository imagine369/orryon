import { access, readFile, stat } from "fs/promises";
import path from "path";
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

async function resolveDownload(platform: string) {
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

  const filePath = path.join(process.cwd(), "public", "downloads", meta.filename);
  try {
    await access(filePath);
    return { meta, filePath };
  } catch {
    if (process.env.VERCEL) {
      return {
        error: NextResponse.json(
          {
            error: "Desktop installer is not configured for production yet.",
            hint: `Set NEXT_PUBLIC_DESKTOP_DOWNLOAD_${platform.toUpperCase()} to a hosted installer URL (e.g. GitHub Releases).`,
          },
          { status: 503 },
        ),
      };
    }
    return {
      error: NextResponse.json(
        { error: `Installer not found: ${meta.filename}` },
        { status: 404 },
      ),
    };
  }
}

export async function HEAD(
  _request: Request,
  context: { params: Promise<{ platform: string }> },
) {
  const { platform } = await context.params;
  const resolved = await resolveDownload(platform);
  if ("error" in resolved && resolved.error) return resolved.error;
  if ("redirect" in resolved && resolved.redirect) {
    return NextResponse.redirect(resolved.redirect, 302);
  }
  const { meta, filePath } = resolved as { meta: (typeof FILES)[string]; filePath: string };
  const info = await stat(filePath);
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Content-Type": meta.contentType,
      "Content-Disposition": `attachment; filename="${meta.filename}"`,
      "Content-Length": String(info.size),
    },
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ platform: string }> },
) {
  const { platform } = await context.params;
  const resolved = await resolveDownload(platform);
  if ("error" in resolved && resolved.error) return resolved.error;
  if ("redirect" in resolved && resolved.redirect) {
    return NextResponse.redirect(resolved.redirect, 302);
  }
  const { meta, filePath } = resolved as { meta: (typeof FILES)[string]; filePath: string };
  const body = await readFile(filePath);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": meta.contentType,
      "Content-Disposition": `attachment; filename="${meta.filename}"`,
      "Content-Length": String(body.length),
      "Cache-Control": "public, max-age=3600",
    },
  });
}
