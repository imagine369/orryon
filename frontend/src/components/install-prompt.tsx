"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download, Share, Plus } from "lucide-react";
import { usePwaInstall, platformLabel } from "@/lib/use-pwa-install";

// InstallPrompt is kept for compatibility but renders nothing —
// install is surfaced only via Settings > App and the /download page.
export function InstallPrompt() {
  return null;
}

function Feature({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-1 h-1 rounded-full bg-white/20 shrink-0" />
      <p className="text-[13px] text-white/50">{text}</p>
    </div>
  );
}

function IosInstructions() {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 space-y-3">
      <p className="text-xs text-white/45 font-medium uppercase tracking-wider">How to install on iOS</p>
      <div className="flex items-start gap-3">
        <div className="w-6 h-6 rounded-full bg-white/[0.06] flex items-center justify-center shrink-0 mt-0.5">
          <Share className="h-3 w-3 text-white/50" strokeWidth={1.5} />
        </div>
        <div>
          <p className="text-[13px] text-white/70">Tap the Share button</p>
          <p className="text-[11px] text-white/30 mt-0.5">In Safari&apos;s bottom toolbar</p>
        </div>
      </div>
      <div className="flex items-start gap-3">
        <div className="w-6 h-6 rounded-full bg-white/[0.06] flex items-center justify-center shrink-0 mt-0.5">
          <Plus className="h-3 w-3 text-white/50" strokeWidth={1.5} />
        </div>
        <div>
          <p className="text-[13px] text-white/70">Tap &ldquo;Add to Home Screen&rdquo;</p>
          <p className="text-[11px] text-white/30 mt-0.5">Scroll down if you don&apos;t see it</p>
        </div>
      </div>
    </div>
  );
}

// Standalone button for use in settings only
export function InstallButton({ variant = "settings" }: { variant?: "settings" }) {
  const { isInstalled, isIos, isInstallable, install, platform } = usePwaInstall();
  const [modalOpen, setModalOpen] = useState(false);
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
        onClick={() => isIos ? setModalOpen(true) : install()}
        disabled={!isInstallable && !isIos}
        className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-black bg-white hover:bg-gray-100 rounded-xl transition active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Download className="h-4 w-4" strokeWidth={2} />
        Download for {label}
      </button>
      {!isInstallable && !isIos && (
        <p className="mt-2 text-center text-xs text-white/25">
          Open in Chrome or Safari to install
        </p>
      )}
      <Link
        href="/download"
        className="mt-3 block text-center text-xs text-white/25 hover:text-white/45 transition"
      >
        All platforms →
      </Link>
      {isIos && modalOpen && (
        <IosModal onClose={() => setModalOpen(false)} />
      )}
    </>
  );
}

function IosModal({ onClose }: { onClose: () => void }) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-[3px]"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="fixed inset-x-4 bottom-8 z-[61] mx-auto max-w-md"
      >
        <div className="rounded-2xl border border-white/[0.08] bg-[#0a0a0a] p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <Image
                src="/avatar.png"
                alt="Orryon"
                width={40}
                height={40}
                className="rounded-xl object-cover ring-1 ring-white/[0.08]"
              />
              <p className="text-[15px] font-semibold text-white">Install on iOS</p>
            </div>
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-colors"
            >
              <X className="h-3.5 w-3.5 text-white/50" strokeWidth={1.5} />
            </button>
          </div>
          <IosInstructions />
          <button
            onClick={onClose}
            className="w-full mt-4 py-2.5 text-xs text-white/40 border border-white/10 rounded-xl hover:bg-white/5 transition"
          >
            Got it
          </button>
        </div>
      </motion.div>
    </>
  );
}
