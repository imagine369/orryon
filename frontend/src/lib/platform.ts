export type Platform =
  | "ios"
  | "android"
  | "mac"
  | "windows"
  | "linux"
  | "desktop"
  | "unknown";

export type DownloadKind = "desktop" | "pwa" | "browser";

/** Testable platform detection (pass UA from unit tests). */
export function detectPlatformFromUserAgent(
  ua: string,
  navPlatform = "",
  maxTouchPoints = 0,
): Platform {
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (navPlatform === "MacIntel" && maxTouchPoints > 1) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Macintosh|MacIntel|MacPPC|Mac68K/.test(ua)) return "mac";
  if (/Win32|Win64|Windows|WinCE/.test(ua)) return "windows";
  if (/Linux|CrOS/.test(ua)) return "linux";
  return "desktop";
}

export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "unknown";
  return detectPlatformFromUserAgent(
    navigator.userAgent,
    navigator.platform,
    navigator.maxTouchPoints,
  );
}

export function isOrryonDesktopApp(): boolean {
  if (typeof navigator === "undefined") return false;
  return /OrryonDesktop/i.test(navigator.userAgent);
}

export function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  if ((navigator as Navigator & { standalone?: boolean }).standalone) return true;
  if (document.referrer.includes("android-app://")) return true;
  return false;
}

export function isAppInstalled(): boolean {
  return isOrryonDesktopApp() || isStandalonePwa();
}

export function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  if (detectPlatform() !== "ios") return false;
  const ua = navigator.userAgent;
  return /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
}

/** iOS Safari requires DeviceMotionEvent.requestPermission() inside a user gesture. */
export function deviceMotionRequiresGesture(): boolean {
  if (typeof window === "undefined") return false;
  const motionCtor = window.DeviceMotionEvent as typeof DeviceMotionEvent & {
    requestPermission?: () => Promise<PermissionState>;
  };
  return typeof motionCtor?.requestPermission === "function";
}

export function downloadKindForPlatform(platform: Platform): DownloadKind {
  if (platform === "ios" || platform === "android") return "pwa";
  if (platform === "mac" || platform === "windows" || platform === "linux") return "desktop";
  return "browser";
}

export function platformLabel(platform: Platform): string {
  switch (platform) {
    case "ios":
      return "iPhone & iPad";
    case "android":
      return "Android";
    case "mac":
      return "Mac";
    case "windows":
      return "Windows";
    case "linux":
      return "Linux";
    default:
      return "your device";
  }
}

export function platformShortLabel(platform: Platform): string {
  switch (platform) {
    case "ios":
      return "iOS";
    case "android":
      return "Android";
    case "mac":
      return "macOS";
    case "windows":
      return "Windows";
    case "linux":
      return "Linux";
    default:
      return "Desktop";
  }
}

export type DownloadTab = "mac" | "windows" | "linux" | "ios" | "android";

export function defaultDownloadTab(platform: Platform): DownloadTab {
  if (platform === "ios") return "ios";
  if (platform === "android") return "android";
  if (platform === "windows") return "windows";
  if (platform === "linux") return "linux";
  return "mac";
}
