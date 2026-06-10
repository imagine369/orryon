import { stickyDeniedHelpText } from "@/lib/chat-input-helpers";

function isOrryonDesktop(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent.includes("OrryonDesktop");
}

function isMacDesktop(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent.toLowerCase();
  return /macintosh|mac os x/.test(ua) && !/iphone|ipad|ipod/.test(ua);
}

export function noMicDetectedHelpText(): string {
  if (isOrryonDesktop()) {
    return "Orryon can't access your microphone. Open System Settings → Privacy & Security → Microphone, turn on Orryon, then quit and reopen the app.";
  }
  if (isMacDesktop()) {
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

async function tryGetUserMedia(
  constraints: MediaStreamConstraints,
): Promise<MediaStream | null> {
  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    const name = (err as DOMException)?.name || "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      throw err;
    }
    return null;
  }
}

/**
 * Request microphone access with fallbacks for macOS / multi-device setups.
 * Throws DOMException on permission denial; other failures use the last error.
 */
export async function requestMicrophoneStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new DOMException(
      "Microphone access is not available in this browser.",
      "NotSupportedError",
    );
  }

  const basicStrategies: MediaStreamConstraints[] = [
    { audio: true },
    { audio: { echoCancellation: true, noiseSuppression: true } },
    { audio: { deviceId: "default" } },
  ];

  let lastError: DOMException | Error | null = null;

  for (const constraints of basicStrategies) {
    try {
      const stream = await tryGetUserMedia(constraints);
      if (stream) return stream;
    } catch (err) {
      throw err;
    }
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices.filter((d) => d.kind === "audioinput" && d.deviceId);
    for (const device of inputs) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: device.deviceId } },
        });
        return stream;
      } catch (err) {
        lastError = err as DOMException;
        const name = (err as DOMException)?.name || "";
        if (name === "NotAllowedError" || name === "SecurityError") {
          throw err;
        }
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
