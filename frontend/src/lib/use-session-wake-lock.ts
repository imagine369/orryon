"use client";

import { useEffect } from "react";

/** Keep the screen awake during an active breathing session. */
export function useSessionWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) {
      return;
    }

    let lock: WakeLockSentinel | null = null;
    let cancelled = false;

    const request = async () => {
      try {
        lock = await navigator.wakeLock.request("screen");
        lock.addEventListener("release", () => {
          lock = null;
        });
      } catch {
        /* unsupported or denied */
      }
    };

    void request();

    const onVisibility = () => {
      if (document.visibilityState === "visible" && !cancelled && !lock) {
        void request();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      lock?.release().catch(() => {});
    };
  }, [active]);
}
