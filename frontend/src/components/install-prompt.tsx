"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { AndroidInstallModal } from "@/components/android-install-modal";
import { iosInstallCtaLabel, iosInstallFootnote, isIosInstallContext } from "@/lib/ios-install";
import { useIosInstallModals } from "@/lib/use-ios-install-modals";
import { detectPlatform } from "@/lib/platform";
import { usePwaInstall, platformLabel } from "@/lib/use-pwa-install";

const DEFAULT_CTA = `Download for ${platformLabel("unknown")}`;

export function InstallButton() {
  const router = useRouter();
  const { isInstalled, isInstallable, install } = usePwaInstall();
  const [androidModalOpen, setAndroidModalOpen] = useState(false);
  const { openIosInstall, iosInstallModals } = useIosInstallModals();
  const [ctaLabel, setCtaLabel] = useState(DEFAULT_CTA);
  const [showIosFootnote, setShowIosFootnote] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      const platform = detectPlatform();
      const ios = isIosInstallContext(platform);
      setCtaLabel(ios ? iosInstallCtaLabel() : `Download for ${platformLabel(platform)}`);
      setShowIosFootnote(ios);
    });
  }, []);

  if (isInstalled) {
    return (
      <div className="w-full flex items-center justify-center gap-2 py-3 text-sm text-green-400/70 border border-green-500/[0.12] rounded-xl bg-green-500/[0.04]">
        <Download className="h-4 w-4" strokeWidth={1.5} />
        Orryon is installed on this device
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => {
          const platform = detectPlatform();
          if (isIosInstallContext(platform)) {
            openIosInstall();
            return;
          }
          if (platform === "android") {
            if (isInstallable) void install();
            else setAndroidModalOpen(true);
            return;
          }
          if (isInstallable) {
            void install();
            return;
          }
          router.push("/download");
        }}
        className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-black bg-white hover:bg-gray-100 rounded-xl transition active:scale-[0.98]"
      >
        <Download className="h-4 w-4" strokeWidth={2} />
        {ctaLabel}
      </button>
      {showIosFootnote && (
        <p className="mt-2 text-center text-xs text-white/30">{iosInstallFootnote()}</p>
      )}
      <Link href="/download" className="mt-3 block text-center text-xs text-white/25 hover:text-white/45 transition">
        All platforms →
      </Link>
      {iosInstallModals}
      {androidModalOpen && <AndroidInstallModal onClose={() => setAndroidModalOpen(false)} />}
    </>
  );
}
