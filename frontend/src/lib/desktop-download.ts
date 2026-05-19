import type { Platform } from "@/lib/platform";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://orryon.vercel.app").replace(/\/$/, "");

export type DesktopOs = "mac" | "windows" | "linux";

/** Same-origin download route — serves file or redirects to hosted release URL. */
export function getDesktopDownloadUrl(platform: DesktopOs): string {
  const explicit =
    platform === "mac"
      ? process.env.NEXT_PUBLIC_DESKTOP_DOWNLOAD_MAC
      : platform === "windows"
        ? process.env.NEXT_PUBLIC_DESKTOP_DOWNLOAD_WINDOWS
        : process.env.NEXT_PUBLIC_DESKTOP_DOWNLOAD_LINUX;

  if (explicit) return explicit;

  return `${APP_URL}/api/download/${platform}`;
}

export function desktopPlatformFromDetected(platform: Platform): DesktopOs | null {
  if (platform === "mac") return "mac";
  if (platform === "windows") return "windows";
  if (platform === "linux") return "linux";
  return null;
}

const DOWNLOAD_STARTED_KEY = "orryon_desktop_download_started";

export function markDesktopDownloadStarted(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DOWNLOAD_STARTED_KEY, String(Date.now()));
  } catch {
    // private mode
  }
}

export function hasStartedDesktopDownload(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return !!localStorage.getItem(DOWNLOAD_STARTED_KEY);
  } catch {
    return false;
  }
}

/** HEAD-check whether the installer is hosted (avoids silent 404s). */
export async function isDesktopDownloadAvailable(platform: DesktopOs): Promise<boolean> {
  const url = getDesktopDownloadUrl(platform);
  try {
    const res = await fetch(url, { method: "HEAD", cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

export { APP_URL };
