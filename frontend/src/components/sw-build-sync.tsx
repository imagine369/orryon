"use client";

import { useEffect } from "react";
import { CANARY } from "@/lib/integrity";
import { registerServiceWorker } from "@/lib/register-service-worker";
import {
  LS_CANARY_KEY,
  PWA_UI_MIGRATION_KEYS,
  pendingPwaMigrations,
} from "@/lib/sw-build-sync-helpers";

const CACHE_BUST_FLAG = "orryon_cache_bust_in_progress";

let buildSyncInFlight = false;

export function SwBuildSync() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (buildSyncInFlight) return;
    buildSyncInFlight = true;

    async function bustCachesAndReload() {
      if (sessionStorage.getItem(CACHE_BUST_FLAG)) return;
      sessionStorage.setItem(CACHE_BUST_FLAG, "1");

      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      localStorage.setItem(LS_CANARY_KEY, CANARY);
      window.location.reload();
    }

    async function run() {
      try {
        const pending = pendingPwaMigrations(PWA_UI_MIGRATION_KEYS, localStorage);
        if (pending.length > 0) {
          for (const key of pending) localStorage.setItem(key, "1");
          await bustCachesAndReload();
          return;
        }

        const prev = localStorage.getItem(LS_CANARY_KEY);
        if (prev && prev !== CANARY) {
          await bustCachesAndReload();
          return;
        }

        if (!prev) localStorage.setItem(LS_CANARY_KEY, CANARY);

        sessionStorage.removeItem(CACHE_BUST_FLAG);

        await registerServiceWorker();
        if ("serviceWorker" in navigator) {
          void navigator.serviceWorker.getRegistration().then((reg) => reg?.update());
        }
      } finally {
        buildSyncInFlight = false;
      }
    }

    void run();
  }, []);

  return null;
}
