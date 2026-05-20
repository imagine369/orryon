"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { PillButton, PillLink } from "@/components/pill-cta";
import { IosInstallModal } from "@/components/ios-install-modal";
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

/** Matches landing page hero avatar (page.tsx). */
const HERO_AVATAR_CLASS =
  "w-[150px] h-[150px] sm:w-[155px] sm:h-[155px] lg:w-[195px] lg:h-[195px] rounded-full object-contain ring-1 ring-white/10";

const AVATAR_FLOAT = {
  animate: { y: [0, -6, 0], scale: [1, 1.025, 1] },
  transition: { duration: 3.8, ease: "easeInOut" as const, repeat: Infinity, repeatType: "loop" as const },
};

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

function footnoteFor(tab: DownloadTab): string | null {
  switch (tab) {
    case "mac":
      return "macOS 12+";
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

  const handlePrimary = () => {
    if (isDesktopTab(selected)) {
      markDesktopDownloadStarted();
      window.location.assign(getDesktopDownloadUrl(selected));
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
        <div className={`${HERO_AVATAR_CLASS} bg-white/10 animate-pulse`} />
      </main>
    );
  }

  if (installed) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
        <motion.div className="mb-8" {...AVATAR_FLOAT}>
            <Image
              src="/avatar.png"
              alt="Orryon"
              width={195}
              height={195}
              priority
              className={HERO_AVATAR_CLASS}
            />
          </motion.div>
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

  const primaryDisabled = selected === "android" && !isInstallable;

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 sm:py-24 text-center">
      <motion.div className="mb-8" {...AVATAR_FLOAT}>
          <Image
            src="/avatar.png"
            alt="Orryon"
            width={195}
            height={195}
            priority
            className={HERO_AVATAR_CLASS}
          />
        </motion.div>

      <p className="text-white/45 text-base sm:text-lg mb-10 max-w-md leading-relaxed">
          {isMobile
            ? "Add Orryon to your home screen, then open the app to sign up."
            : "Install the app, then open Orryon from your dock to sign up."}
        </p>

      {iosNeedsSafari && (
        <p className="text-sm text-white/40 mb-6 max-w-sm">
          Open this page in <span className="text-white/70">Safari</span> to install.
        </p>
      )}

      <PillButton
        type="button"
        onClick={handlePrimary}
        disabled={primaryDisabled}
        size="sm"
        variant="primary"
      >
        Download
      </PillButton>

      {footnoteFor(selected) && (
        <p className="mt-4 text-sm text-white/30">{footnoteFor(selected)}</p>
      )}

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

      {iosModalOpen && <IosInstallModal onClose={() => setIosModalOpen(false)} />}
    </main>
  );
}
