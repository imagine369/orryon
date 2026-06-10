/** iOS / iPadOS — PWA install helpers. */

import { detectPlatform, isIosSafari, isStandalonePwa, type Platform } from "@/lib/platform";

const INSTALL_PATH = "/login?step=email";

/** URL baked into the installed PWA (matches manifest start_url). */
export function iosInstallUrl(): string {
  if (typeof window === "undefined") return INSTALL_PATH;
  return `${window.location.origin}${INSTALL_PATH}`;
}

/**
 * Which install UI to show on iPhone/iPad.
 * Always opens a modal — never depends on Web Share API (A2HS requires Safari's toolbar).
 */
export type IosInstallModalKind = "safari-instructions" | "open-in-safari";

export function iosInstallModalKind(): IosInstallModalKind {
  return isIosSafari() ? "safari-instructions" : "open-in-safari";
}

/** Shared CTA copy for every iOS install entry point. */
export function iosInstallCtaLabel(): string {
  return iosInstallModalKind() === "safari-instructions"
    ? "Add to Home Screen"
    : "Get for iPhone & iPad";
}

/** Short hint shown below install CTAs on iPhone/iPad (before the instruction modal opens). */
export function iosInstallFootnote(): string {
  return iosInstallModalKind() === "safari-instructions"
    ? "Use Safari's Share button at the bottom of the screen"
    : "Open in Safari to install";
}

/** Whether this device should use the iOS install flow (not desktop download). */
export function isIosInstallContext(platform: Platform = detectPlatform()): boolean {
  return platform === "ios" && !isStandalonePwa();
}

/** Nav / compact install button label — matches download page & settings on iOS. */
export function appNavInstallLabel(platform: Platform = detectPlatform()): string {
  return isIosInstallContext(platform) ? iosInstallCtaLabel() : "Download";
}
