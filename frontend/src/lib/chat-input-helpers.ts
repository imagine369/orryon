export type VoiceStatus =
  | "idle"
  | "listening"
  | "transcribing"
  | "thinking"
  | "speaking";

export type MessageSource = "text" | "voice";

export const SILENCE_RMS_THRESHOLD = 0.012;
export const SILENCE_HANG_MS = 1400;
export const NO_SPEECH_TIMEOUT_MS = 8000;
export const MAX_RECORDING_MS = 30_000;

export function stickyDeniedHelpText(): string {
  if (typeof navigator === "undefined") {
    return "Microphone permission is blocked for this site.";
  }
  const ua = navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isBrave = "brave" in (navigator as unknown as Record<string, unknown>);
  const isFirefox = ua.includes("firefox");
  const isSafari = ua.includes("safari") && !ua.includes("chrome") && !ua.includes("chromium");
  const isChrome = ua.includes("chrome") || ua.includes("chromium");

  if (isIOS) {
    return "Mic is blocked for this site in iOS. Tap the AA / … menu in the address bar → Website Settings → Microphone → Allow, then reload.";
  }
  if (isBrave) {
    return "Mic is blocked for this site in Brave. Tap the padlock in the URL bar → Site settings → change Microphone from Block to Allow, then reload.";
  }
  if (isFirefox) {
    return "Mic is blocked for this site in Firefox. Tap the padlock in the URL bar → Connection Secure → More information → Permissions → uncheck 'Use Default' next to Microphone and set it to Allow, then reload.";
  }
  if (isSafari) {
    return "Mic is blocked for this site in Safari. Safari → Settings → Websites → Microphone → set this site to Allow, then reload.";
  }
  if (isChrome) {
    return "Mic is blocked for this site in Chrome. Tap the padlock in the URL bar → Site settings → change Microphone from Block to Allow, then reload.";
  }
  return "Mic is blocked for this site. Open your browser's site/permissions settings for this URL and set Microphone to Allow, then reload.";
}
