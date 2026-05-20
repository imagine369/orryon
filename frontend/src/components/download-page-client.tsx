"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IosInstallModal } from "@/components/ios-install-modal";
import { MacInstallHelp } from "@/components/mac-install-help";
import { OrryonAvatar } from "@/components/orryon-avatar";
import { usePwaInstall } from "@/lib/use-pwa-install";
import {
  defaultDownloadTab,
  detectPlatform,
  downloadKindForPlatform,
  isIosSafari,
  isOrryonDesktopApp,
  isStandalonePwa,
  type DownloadTab,
  type Platform,
} from "@/lib/platform";
import {
  getDesktopDownloadUrl,
  markDesktopDownloadStarted,
  type DesktopOs,
} from "@/lib/desktop-download";

const PLATFORM_LINKS: { id: DownloadTab; label: string }[] = [
  { id: "mac", label: "macOS" },
  { id: "windows", label: "Windows" },
  { id: "linux", label: "Linux" },
  { id: "ios", label: "iPhone & iPad" },
  { id: "android", label: "Android" },
];

function isDesktopTab(tab: DownloadTab): tab is DesktopOs {
  return tab === "mac" || tab === "windows" || tab === "linux";
}

function ctaFor(tab: DownloadTab, installable: boolean): string {
  switch (tab) {
    case "mac":
      return "Download for macOS";
    case "windows":
      return "Download for Windows";
    case "linux":
      return "Download for Linux";
    case "ios":
      return "Install for iPhone & iPad";
    case "android":
      return installable ? "Install Orryon" : "Install for Android";
  }
}

function footnoteFor(tab: DownloadTab): string | null {
  switch (tab) {
    case "mac":
      return "macOS 12+. If macOS blocks the app, right-click Orryon → Open.";
    case "windows":
      return "Windows 10 or later";
    case "linux":
      return "AppImage";
    case "ios":
      return "Safari → Share → Add to Home Screen";
    case "android":
      return "Chrome → Install app";
  }
}

export function DownloadPageClient() {
  const [mounted, setMounted] = useState(false);
  const [detected, setDetected] = useState<Platform>("unknown");
  const [selected, setSelected] = useState<DownloadTab>("mac");
  const [iosModalOpen, setIosModalOpen] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const { isInstallable, install } = usePwaInstall();

  useEffect(() => {
    const p = detectPlatform();
    setDetected(p);
    setSelected(defaultDownloadTab(p));
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && isOrryonDesktopApp()) {
      window.location.replace("/login?step=email");
    }
  }, [mounted]);

  const installed = mounted && isStandalonePwa();
  const isMobile = mounted && downloadKindForPlatform(detected) === "pwa";
  const iosNeedsSafari = mounted && selected === "ios" && !isIosSafari();

  const handlePrimary = async () => {
    if (isDesktopTab(selected)) {
      setDownloadError(null);
      setDownloading(true);
      const url = getDesktopDownloadUrl(selected);
      try {
        const res = await fetch(url, { method: "HEAD", redirect: "manual" });
        if (res.ok || res.status === 302 || res.status === 301) {
          markDesktopDownloadStarted();
          window.location.assign(url);
          return;
        }
        const detail = (await fetch(url).then((r) => r.json()).catch(() => null)) as {
          error?: string;
        } | null;
        setDownloadError(
          detail?.error ??
            "The Mac installer is not available yet. It needs to be uploaded to a public file host first.",
        );
      } catch {
        setDownloadError("Could not reach the download server. Try again in a moment.");
      } finally {
        setDownloading(false);
      }
      return;
    }
    if (selected === "ios") {
      setIosModalOpen(true);
      return;
    }
    void install();
  };

  if (!mounted) {
    return (
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="h-20 w-20 rounded-full bg-white/10 animate-pulse" />
      </main>
    );
  }

  if (installed) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
        <div>
          <OrryonAvatar size={88} className="ring-1 ring-white/10 mx-auto mb-8" priority />
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-3 font-[family-name:var(--font-playfair)]">
            Open Orryon
          </h1>
          <p className="text-white/50 text-lg mb-10 max-w-sm mx-auto">
            You&apos;re all set. Sign in to continue.
          </p>
          <Link
            href="/login?step=email"
            className="inline-flex items-center justify-center rounded-full bg-white px-10 py-3.5 text-base font-semibold text-black hover:bg-white/90 transition-colors"
          >
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  const primaryDisabled = selected === "android" && !isInstallable;

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 sm:py-24 text-center">
      <div>
        <OrryonAvatar size={88} className="ring-1 ring-white/10 mx-auto mb-8" priority />

        <p className="text-white/45 text-base sm:text-lg mb-10 max-w-md mx-auto leading-relaxed">
          {isMobile
            ? "Add Orryon to your home screen, then open the app to sign up."
            : "Install the app, then open Orryon from your dock to sign up."}
        </p>

        {iosNeedsSafari && (
          <p className="text-sm text-white/40 mb-6 max-w-sm mx-auto">
            Open this page in <span className="text-white/70">Safari</span> to install.
          </p>
        )}

        <button
          type="button"
          onClick={() => void handlePrimary()}
          disabled={primaryDisabled || downloading}
          className="inline-flex min-w-[240px] items-center justify-center rounded-full bg-white px-10 py-3.5 text-base font-semibold text-black hover:bg-white/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {downloading ? "Starting download…" : ctaFor(selected, isInstallable)}
        </button>

        {downloadError && (
          <p className="mt-4 text-sm text-amber-400/90 max-w-sm mx-auto leading-relaxed">{downloadError}</p>
        )}

        {footnoteFor(selected) && (
          <p className="mt-4 text-sm text-white/30">{footnoteFor(selected)}</p>
        )}

        {selected === "mac" && <MacInstallHelp />}

        <nav
          className="mt-16 flex flex-wrap items-center justify-center gap-x-1 gap-y-2 text-sm text-white/35"
          aria-label="Other platforms"
        >
          {PLATFORM_LINKS.map((p, i) => (
            <span key={p.id} className="inline-flex items-center gap-1">
              {i > 0 && <span className="text-white/15 px-1">·</span>}
              <button
                type="button"
                onClick={() => setSelected(p.id)}
                className={
                  selected === p.id
                    ? "text-white/80 font-medium"
                    : "hover:text-white/60 transition-colors"
                }
              >
                {p.label}
              </button>
            </span>
          ))}
        </nav>
      </div>

      {iosModalOpen && <IosInstallModal onClose={() => setIosModalOpen(false)} />}
    </main>
  );
}
