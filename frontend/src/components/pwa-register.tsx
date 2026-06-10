"use client";

import { useEffect } from "react";

/** Register the public service worker so mobile browsers can install Orryon as a PWA. */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Private mode, blocked context, or unsupported — install falls back to manual steps.
    });
  }, []);

  return null;
}
