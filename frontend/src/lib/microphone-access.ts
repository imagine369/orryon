import { stickyDeniedHelpText } from "@/lib/chat-input-helpers";
import { isOrryonDesktopApp } from "@/lib/platform";

function isMacDesktop(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent.toLowerCase();
  return /macintosh|mac os x/.test(ua) && !/iphone|ipad|ipod/.test(ua);
}

function browserKind(): "safari" | "chrome" | "firefox" | "other" {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("firefox")) return "firefox";
  if (ua.includes("chrome") || ua.includes("chromium") || ua.includes("edg/")) return "chrome";
  if (ua.includes("safari")) return "safari";
  return "other";
}

export function noMicDetectedHelpText(): string {
  if (isOrryonDesktopApp()) {
    return "Orryon can't access your microphone. Open System Settings → Privacy & Security → Microphone, turn on Orryon, then quit and reopen the app.";
  }
  if (isMacDesktop()) {
    const kind = browserKind();
    if (kind === "safari") {
      return "No microphone detected in Safari. In System Settings → Privacy & Security → Microphone, turn on Safari. Then Safari → Settings → Websites → Microphone → set www.orryon.com to Allow.";
    }
    if (kind === "chrome") {
      return "No microphone detected in Chrome. In System Settings → Privacy & Security → Microphone, turn on Google Chrome. Then check the padlock in the address bar → Site settings → Microphone → Allow.";
    }
    if (kind === "firefox") {
      return "No microphone detected in Firefox. In System Settings → Privacy & Security → Microphone, turn on Firefox. Then check the padlock → Permissions → Microphone → Allow for this site.";
    }
    return "No microphone is available. In System Settings → Privacy & Security → Microphone, allow your browser, then choose an input under Sound → Input.";
  }
  return "No microphone was detected. Connect a mic or check your device's privacy settings, then try again.";
}

export function mapMicrophoneAccessError(err: unknown): string {
  const e = err as DOMException | Error;
  const name = (e as DOMException)?.name || "";

  if (name === "NotAllowedError" || name === "SecurityError") {
    return stickyDeniedHelpText();
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return noMicDetectedHelpText();
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "Your microphone is in use by another app. Close it (Zoom, Discord, etc.) and try again.";
  }
  if (name === "AbortError") {
    return "Recording was interrupted. Please try again.";
  }
  return `Couldn't access the microphone (${name || "unknown error"}).`;
}

/**
 * Request microphone access with fallbacks for macOS / multi-device setups.
 * Throws DOMException on failure — callers map errors to user-facing text.
 */
export async function requestMicrophoneStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new DOMException(
      "Microphone access is not available in this browser.",
      "NotSupportedError",
    );
  }

  const strategies: MediaStreamConstraints[] = [
    { audio: true },
    { audio: { echoCancellation: true, noiseSuppression: true } },
  ];

  let lastError: DOMException | Error | null = null;

  for (const constraints of strategies) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      const name = (err as DOMException)?.name || "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        throw err;
      }
      lastError = err as DOMException;
    }
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices.filter((d) => d.kind === "audioinput" && d.deviceId);
    for (const device of inputs) {
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { ideal: device.deviceId } },
        });
      } catch (err) {
        const name = (err as DOMException)?.name || "";
        if (name === "NotAllowedError" || name === "SecurityError") {
          throw err;
        }
        lastError = err as DOMException;
      }
    }
  } catch (err) {
    const name = (err as DOMException)?.name || "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      throw err;
    }
    lastError = err as DOMException;
  }

  throw lastError ?? new DOMException("No microphone found", "NotFoundError");
}
