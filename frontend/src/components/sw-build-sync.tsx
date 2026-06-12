"use client";

import { useEffect } from "react";
import { CANARY } from "@/lib/integrity";
import { registerServiceWorker } from "@/lib/register-service-worker";
import {
  BUILD_CHECK_INTERVAL_MS,
  CACHE_BUST_FLAG,
  LS_CANARY_KEY,
  PWA_UI_MIGRATION_KEYS,
  fetchRemoteBuildCanary,
  isBundledBuildNewer,
  needsRemoteBuildUpdate,
  pendingPwaMigrations,
  shouldReloadForPendingUpdate,
} from "@/lib/sw-build-sync-helpers";

export function SwBuildSync() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;
    let lastActivityAt = Date.now();
    let pendingRemoteCanary: string | null = null;
    let reloadTimer: ReturnType<typeof setInterval> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    function touchActivity() {
      lastActivityAt = Date.now();
    }

    async function bustCachesAndReload(nextCanary: string) {
      if (cancelled) return;
      if (sessionStorage.getItem(CACHE_BUST_FLAG)) return;

      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        if (cancelled) return;
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        if (cancelled) return;
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if (cancelled) return;
      localStorage.setItem(LS_CANARY_KEY, nextCanary);
      if (sessionStorage.getItem(CACHE_BUST_FLAG)) return;
      sessionStorage.setItem(CACHE_BUST_FLAG, "1");
      window.location.reload();
    }

    function clearReloadTimer() {
      if (reloadTimer) {
        clearInterval(reloadTimer);
        reloadTimer = null;
      }
    }

    function schedulePendingReload() {
      if (reloadTimer || !pendingRemoteCanary) return;

      reloadTimer = setInterval(() => {
        if (cancelled || !pendingRemoteCanary) {
          clearReloadTimer();
          return;
        }

        if (
          shouldReloadForPendingUpdate({
            documentHidden: document.hidden,
            lastActivityAt,
          })
        ) {
          clearReloadTimer();
          void bustCachesAndReload(pendingRemoteCanary);
        }
      }, 1000);
    }

    async function applyRemoteUpdate(remoteCanary: string) {
      if (cancelled) return;
      pendingRemoteCanary = remoteCanary;

      if (document.hidden) return;

      if (
        shouldReloadForPendingUpdate({
          documentHidden: false,
          lastActivityAt,
        })
      ) {
        await bustCachesAndReload(remoteCanary);
        return;
      }

      schedulePendingReload();
    }

    async function checkForRemoteUpdate() {
      if (cancelled) return;
      const stored = localStorage.getItem(LS_CANARY_KEY);
      const remote = await fetchRemoteBuildCanary();
      if (cancelled) return;
      if (!needsRemoteBuildUpdate(CANARY, stored, remote)) return;
      await applyRemoteUpdate(remote);
    }

    async function runInitialSync() {
      // Each load gets a fresh bust attempt — flag may persist across reload from the prior one.
      sessionStorage.removeItem(CACHE_BUST_FLAG);

      const pending = pendingPwaMigrations(PWA_UI_MIGRATION_KEYS, localStorage);
      if (pending.length > 0) {
        for (const key of pending) localStorage.setItem(key, "1");
        if (cancelled) return;
        await bustCachesAndReload(CANARY);
        return;
      }

      const prev = localStorage.getItem(LS_CANARY_KEY);
      if (isBundledBuildNewer(prev, CANARY)) {
        if (cancelled) return;
        await bustCachesAndReload(CANARY);
        return;
      }

      if (!prev) localStorage.setItem(LS_CANARY_KEY, CANARY);

      if (cancelled) return;

      await registerServiceWorker();
      if (cancelled) return;

      if ("serviceWorker" in navigator) {
        void navigator.serviceWorker.getRegistration().then((reg) => reg?.update());
      }

      await checkForRemoteUpdate();
    }

    function onVisibilityChange() {
      if (cancelled || document.hidden || !pendingRemoteCanary) return;
      void bustCachesAndReload(pendingRemoteCanary);
    }

    const activityEvents = ["pointerdown", "keydown", "touchstart", "scroll"] as const;
    for (const event of activityEvents) {
      window.addEventListener(event, touchActivity, { passive: true });
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    pollTimer = setInterval(() => {
      void checkForRemoteUpdate();
    }, BUILD_CHECK_INTERVAL_MS);

    void runInitialSync();

    return () => {
      cancelled = true;
      clearReloadTimer();
      if (pollTimer) clearInterval(pollTimer);
      for (const event of activityEvents) {
        window.removeEventListener(event, touchActivity);
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return null;
}
