"use client";

import { useEffect } from "react";
import { CANARY } from "@/lib/integrity";

const LS_CANARY_KEY = "orryon_build_canary";
/** One-time flag — bust stale PWA bundles that still ship the removed floating Orryon. */
const BUDDY_REMOVAL_MIGRATION = "orryon_floating_buddy_removed_v1";
/** One-time flag — bust bundles that still render Orryon on every assistant reply. */
const SINGLE_CHAT_AVATAR_MIGRATION = "orryon_single_chat_avatar_v1";

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
      for (const key of [BUDDY_REMOVAL_MIGRATION, SINGLE_CHAT_AVATAR_MIGRATION]) {
        if (!localStorage.getItem(key)) {
          localStorage.setItem(key, "1");
          await bustCachesAndReload();
          return;
        }
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
