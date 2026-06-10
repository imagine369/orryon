"use client";

import { useEffect, useState } from "react";
import { AnimatedHeroAvatar, HeroAvatarSkeleton } from "@/components/animated-hero-avatar";
import { PillButton, PillLink } from "@/components/pill-cta";
import { AndroidInstallModal } from "@/components/android-install-modal";
import { usePwaInstall } from "@/lib/use-pwa-install";
import { iosInstallCtaLabel, iosInstallFootnote } from "@/lib/ios-install";
import { useIosInstallModals } from "@/lib/use-ios-install-modals";
import {
  defaultDownloadTab,
  detectPlatform,
  isOrryonDesktopApp,
  isStandalonePwa,
  type DownloadTab,
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
      return "Download for Mac";
    case "windows":
      return "Download for Windows";
    case "linux":
      return "Download for Linux";
    case "ios":
      return iosInstallCtaLabel();
    case "android":
      return installable ? "Install Orryon" : "Install for Android";
  }
}

function headlineFor(tab: DownloadTab): string {
  switch (tab) {
    case "mac":
      return "Download for macOS";
    case "windows":
      return "Download for Windows";
    case "linux":
      return "Download for Linux";
    case "ios":
      return "Orryon for iPhone & iPad";
    case "android":
      return "Download for Android";
  }
}

function footnoteFor(tab: DownloadTab): string | null {
  switch (tab) {
    case "mac":
      return "macOS 12+";
    case "windows":
      return "Windows 10 or later";
    case "linux":
      return "AppImage";
    case "ios":
      return iosInstallFootnote();
    case "android":
      return "Installs to your home screen";
  }
}

function DownloadAvatar({ priority }: { priority?: boolean }) {
  return <AnimatedHeroAvatar size="hero" priority={priority} wrapperClassName="mb-8" />;
}

export function DownloadPageClient() {
  const [mounted, setMounted] = useState(false);
  const [selected, setSelected] = useState<DownloadTab>("mac");
  const [androidModalOpen, setAndroidModalOpen] = useState(false);
  const { openIosInstall, iosInstallModals } = useIosInstallModals();
  const { isInstallable, install } = usePwaInstall();

  useEffect(() => {
    queueMicrotask(() => {
      setSelected(defaultDownloadTab(detectPlatform()));
      setMounted(true);
    });
  }, []);

  useEffect(() => {
    if (mounted && isOrryonDesktopApp()) {
      window.location.replace("/login?step=email");
    }
  }, [mounted]);

  const installed = mounted && isStandalonePwa();
  const handlePrimary = () => {
    if (isDesktopTab(selected)) {
      markDesktopDownloadStarted();
      window.location.assign(getDesktopDownloadUrl(selected));
      return;
    }
    if (selected === "ios") {
      openIosInstall();
      return;
    }
    if (selected === "android") {
      if (isInstallable) {
        void install();
      } else {
        setAndroidModalOpen(true);
      }
      return;
    }
  };

  if (!mounted) {
    return (
      <main className="flex-1 flex items-center justify-center px-6">
        <HeroAvatarSkeleton />
      </main>
    );
  }

  if (installed) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
        <DownloadAvatar priority />
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-3 font-[family-name:var(--font-playfair)]">
          Open Orryon
        </h1>
        <p className="text-white/50 text-lg mb-10 max-w-sm">
          You&apos;re all set. Sign in to continue.
        </p>
        <PillLink href="/login?step=email" size="sm" variant="secondary">
          Sign in
        </PillLink>
      </main>
    );
  }

  const footnote = footnoteFor(selected);

  return (
    <>
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 sm:py-24 text-center">
        <DownloadAvatar priority />

        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-3 font-[family-name:var(--font-playfair)]">
          {headlineFor(selected)}
        </h1>

        <p className="text-white/45 text-base sm:text-lg mb-10 max-w-md leading-relaxed">
          {selected === "ios"
            ? "Install Orryon as a web app — same as using Cursor on iPhone and iPad."
            : isDesktopTab(selected)
              ? "Download the desktop app, then open Orryon from your dock."
              : "Install Orryon on your home screen, then sign in."}
        </p>

        <div className="w-full max-w-sm">
          <PillButton
            type="button"
            onClick={handlePrimary}
            variant="primary"
            className="w-full"
          >
            {ctaFor(selected, isInstallable)}
          </PillButton>
        </div>

        {footnote && <p className="mt-4 text-sm text-white/30">{footnote}</p>}

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
                className={`min-h-11 px-2 py-2 touch-manipulation ${
                  selected === p.id
                    ? "text-white/80 font-medium"
                    : "hover:text-white/60 transition-colors"
                }`}
              >
                {p.label}
              </button>
            </span>
          ))}
        </nav>
      </main>
      {iosInstallModals}
      {androidModalOpen && <AndroidInstallModal onClose={() => setAndroidModalOpen(false)} />}
    </>
  );
}
