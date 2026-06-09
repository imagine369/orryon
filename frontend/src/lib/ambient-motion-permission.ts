/**
 * iOS Safari motion permission cache + devicemotion probe helpers.
 * Extracted for unit tests and use by sensor-fusion.
 */

import { Capacitor } from "@capacitor/core";
import { deviceMotionRequiresGesture } from "@/lib/platform";

export const MOTION_GRANTED_STORAGE_KEY = "ambient_motion_granted";
export const MOTION_PROBE_TIMEOUT_MS = 500;

export function readAmbientMotionGrantedStorage(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(MOTION_GRANTED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function storeAmbientMotionGranted(
  granted: boolean,
  onGranted?: () => void,
): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (granted) {
      sessionStorage.setItem(MOTION_GRANTED_STORAGE_KEY, "1");
      onGranted?.();
    } else {
      sessionStorage.removeItem(MOTION_GRANTED_STORAGE_KEY);
    }
  } catch {
    // private browsing / storage blocked
  }
}

/** Wait for a non-zero devicemotion sample (iOS permission sanity check). */
export function probeDeviceMotionSample(timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("DeviceMotionEvent" in window)) {
      resolve(false);
      return;
    }

    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("devicemotion", onMotion);
      clearTimeout(timer);
      resolve(ok);
    };

    const onMotion = (event: DeviceMotionEvent) => {
      const accel = event.accelerationIncludingGravity ?? event.acceleration;
      if (!accel) return;
      const x = accel.x ?? 0;
      const y = accel.y ?? 0;
      const z = accel.z ?? 0;
      if (x === 0 && y === 0 && z === 0) return;
      finish(true);
    };

    window.addEventListener("devicemotion", onMotion, { passive: true });
    const timer = setTimeout(() => finish(false), timeoutMs);
  });
}

export interface ValidateAmbientMotionStorageOptions {
  timeoutMs?: number;
  onRevoked?: () => void;
}

/**
 * Confirm sessionStorage grant still works (e.g. user revoked motion in site settings).
 * Clears stale storage and runs onRevoked when the probe fails.
 */
export async function validateAmbientMotionStorageGrant(
  options: ValidateAmbientMotionStorageOptions = {},
): Promise<boolean> {
  if (Capacitor.isNativePlatform()) return true;
  if (!deviceMotionRequiresGesture()) {
    return typeof window !== "undefined" && "DeviceMotionEvent" in window;
  }
  if (!readAmbientMotionGrantedStorage()) return false;

  const timeoutMs = options.timeoutMs ?? MOTION_PROBE_TIMEOUT_MS;
  const ok = await probeDeviceMotionSample(timeoutMs);
  if (!ok) {
    storeAmbientMotionGranted(false);
    options.onRevoked?.();
  }
  return ok;
}

/** Whether motion permission was granted this browser session (iOS Safari). */
export function wasAmbientMotionPermissionGranted(): boolean {
  if (Capacitor.isNativePlatform()) return true;
  if (!deviceMotionRequiresGesture()) return true;
  return readAmbientMotionGrantedStorage();
}
