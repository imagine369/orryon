"use client";

import { useEffect } from "react";
import { CANARY } from "@/lib/integrity";

const LS_CANARY_KEY = "orryon_build_canary";
/** One-time flag — bust stale PWA bundles that still ship the removed floating Orryon. */
const BUDDY_REMOVAL_MIGRATION = "orryon_floating_buddy_removed_v1";

export function SwBuildSync() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    async function bustCachesAndReload() {
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
      if (!localStorage.getItem(BUDDY_REMOVAL_MIGRATION)) {
        localStorage.setItem(BUDDY_REMOVAL_MIGRATION, "1");
        await bustCachesAndReload();
        return;
      }

      const prev = localStorage.getItem(LS_CANARY_KEY);
      if (prev && prev !== CANARY) {
        await bustCachesAndReload();
        return;
      }

      if (!prev) localStorage.setItem(LS_CANARY_KEY, CANARY);

      if ("serviceWorker" in navigator) {
        void navigator.serviceWorker.getRegistration().then((reg) => reg?.update());
      }
    }

    void run();
  }, []);

  return null;
}
