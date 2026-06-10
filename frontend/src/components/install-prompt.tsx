"use client";

import { useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { AndroidInstallModal } from "@/components/android-install-modal";
import { IosInstallModal } from "@/components/ios-install-modal";
import { usePwaInstall, platformLabel } from "@/lib/use-pwa-install";

export function InstallPrompt() {
  return null;
}

export function InstallButton({ variant: _variant = "settings" }: { variant?: "settings" } = {}) {
  const { isInstalled, isIos, isInstallable, install, platform } = usePwaInstall();
  const [iosModalOpen, setIosModalOpen] = useState(false);
  const [androidModalOpen, setAndroidModalOpen] = useState(false);
  const label = platformLabel(platform);

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
          if (isIos) {
            setIosModalOpen(true);
            return;
          }
          if (platform === "android") {
            if (isInstallable) void install();
            else setAndroidModalOpen(true);
            return;
          }
          if (isInstallable) void install();
        }}
        className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-black bg-white hover:bg-gray-100 rounded-xl transition active:scale-[0.98]"
      >
        <Download className="h-4 w-4" strokeWidth={2} />
        Download for {label}
      </button>
      <Link href="/download" className="mt-3 block text-center text-xs text-white/25 hover:text-white/45 transition">
        All platforms →
      </Link>
      {iosModalOpen && <IosInstallModal onClose={() => setIosModalOpen(false)} />}
      {androidModalOpen && <AndroidInstallModal onClose={() => setAndroidModalOpen(false)} />}
    </>
  );
}
