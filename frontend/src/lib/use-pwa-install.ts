"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  detectPlatform,
  isStandalonePwa,
  platformLabel,
  type Platform,
} from "@/lib/platform";

export type { Platform };
export { platformLabel };

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "orryon_install_dismissed";
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

function isDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    if (Date.now() - ts < DISMISS_DURATION_MS) return true;
    localStorage.removeItem(DISMISS_KEY);
    return false;
  } catch {
    return false;
  }
}

export function usePwaInstall() {
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [platform] = useState<Platform>(() => detectPlatform());

  useEffect(() => {
    queueMicrotask(() => {
      setIsInstalled(isStandalonePwa());
      setDismissed(isDismissed());
    });

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;
      setIsInstallable(true);
    };

    const onAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      deferredPrompt.current = null;
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const install = useCallback(async (): Promise<boolean> => {
    const prompt = deferredPrompt.current;
    if (!prompt) return false;

    await prompt.prompt();
    const { outcome } = await prompt.userChoice;

    if (outcome === "accepted") {
      setIsInstalled(true);
      setIsInstallable(false);
      deferredPrompt.current = null;
      return true;
    }
    return false;
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // quota / private-mode
    }
  }, []);

  const showPrompt = isInstallable && !isInstalled && !dismissed;
  const isIos = platform === "ios";
  const label = platformLabel(platform);

  return {
    isInstallable,
    isInstalled,
    isIos,
    platform,
    label,
    showPrompt,
    install,
    dismiss,
  };
}
