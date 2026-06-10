/** Server-side desktop installer download API helpers. */

export type DesktopDownloadPlatform = "mac" | "windows" | "linux";

const PLATFORM_LABEL: Record<DesktopDownloadPlatform, string> = {
  mac: "macOS",
  windows: "Windows",
  linux: "Linux",
};

export function desktopDownloadEnvKey(platform: DesktopDownloadPlatform): string {
  return `DESKTOP_DOWNLOAD_${platform.toUpperCase()}_URL`;
}

/** 503 body when a configured installer URL fails HEAD — never includes the URL. */
export function unreachableInstallerBody(platform: DesktopDownloadPlatform) {
  const label = PLATFORM_LABEL[platform];
  return {
    error: `${label} installer is not reachable.`,
    hint: `Set ${desktopDownloadEnvKey(platform)} in Vercel to a public URL and redeploy. Private GitHub repos cannot serve public downloads — use a public release, Vercel Blob, or S3.`,
  };
}

/** 503 body when no installer URL is configured in production. */
export function unconfiguredInstallerBody(platform: DesktopDownloadPlatform) {
  return {
    error: "Desktop installer is not configured for production yet.",
    hint: `Set ${desktopDownloadEnvKey(platform)} to a public installer URL and redeploy.`,
  };
}
