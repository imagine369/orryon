"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download, Share, Plus } from "lucide-react";
import { usePwaInstall } from "@/lib/use-pwa-install";

export function InstallPrompt() {
  const { showPrompt, isIos, install, dismiss, platform } = usePwaInstall();
  const [open, setOpen] = useState(false);

  if (!showPrompt && !open) return null;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-[3px]"
            onClick={() => setOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="fixed inset-x-4 bottom-8 z-[61] mx-auto max-w-md"
          >
            <div className="rounded-2xl border border-white/[0.08] bg-[#0a0a0a] p-6 shadow-2xl">
              <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-3">
                  <Image
                    src="/avatar.png"
                    alt="Orryon"
                    width={44}
                    height={44}
                    className="rounded-xl object-cover ring-1 ring-white/[0.08]"
                  />
                  <div>
                    <p className="text-[15px] font-semibold text-white">Get the Orryon app</p>
                    <p className="text-xs text-white/35 mt-0.5">Use Orryon like a native app</p>
                  </div>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-colors shrink-0"
                >
                  <X className="h-3.5 w-3.5 text-white/50" strokeWidth={1.5} />
                </button>
              </div>

              <div className="space-y-2.5 mb-5">
                <Feature text="Instant access from your home screen" />
                <Feature text="Full-screen experience, no browser UI" />
                <Feature text="Faster load times with offline caching" />
              </div>

              {isIos ? (
                <IosInstructions />
              ) : (
                <button
                  onClick={async () => {
                    const accepted = await install();
                    if (accepted) setOpen(false);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-white text-black text-sm font-semibold rounded-xl hover:bg-gray-100 transition active:scale-[0.98]"
                >
                  <Download className="h-4 w-4" strokeWidth={2} />
                  Install Orryon
                </button>
              )}

              <div className="flex items-center justify-between mt-4">
                <button
                  onClick={() => { setOpen(false); dismiss(); }}
                  className="text-xs text-white/25 hover:text-white/45 transition"
                >
                  Maybe later
                </button>
                <Link
                  href="/download"
                  onClick={() => setOpen(false)}
                  className="text-xs text-white/25 hover:text-white/45 transition"
                >
                  All platforms →
                </Link>
              </div>
            </div>
          </motion.div>
        </>
      )}

      {/* Floating install banner — only shows when modal is closed */}
      {!open && showPrompt && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ delay: 2, type: "spring", stiffness: 300, damping: 28 }}
          className="fixed bottom-6 inset-x-4 z-[55] mx-auto max-w-sm"
        >
          <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-[#0a0a0a]/95 backdrop-blur-xl p-3.5 shadow-2xl">
            <Image
              src="/avatar.png"
              alt="Orryon"
              width={38}
              height={38}
              className="rounded-xl object-cover ring-1 ring-white/[0.06] shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-white/80 leading-tight">Install Orryon</p>
              <p className="text-[11px] text-white/30 mt-0.5">Add to your home screen</p>
            </div>
            <button
              onClick={() => setOpen(true)}
              className="shrink-0 px-3.5 py-2 bg-white text-black text-xs font-semibold rounded-xl hover:bg-gray-100 transition active:scale-95"
            >
              {platform === "ios" ? "Get" : "Install"}
            </button>
            <button
              onClick={dismiss}
              className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full hover:bg-white/10 transition"
            >
              <X className="h-3 w-3 text-white/30" strokeWidth={1.5} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
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

// Standalone button for use in navbar or settings
export function InstallButton({ variant = "navbar" }: { variant?: "navbar" | "settings" }) {
  const { showPrompt, isInstalled, isIos, install, platform } = usePwaInstall();
  const [modalOpen, setModalOpen] = useState(false);

  if (isInstalled) return null;

  if (variant === "settings") {
    return (
      <>
        <button
          onClick={() => isIos ? setModalOpen(true) : install()}
          className="w-full flex items-center justify-center gap-2 py-3 text-sm text-white/60 hover:text-white border border-white/[0.06] rounded-xl bg-white/[0.03] hover:bg-white/[0.06] transition"
        >
          <Download className="h-4 w-4" strokeWidth={1.5} />
          Install Orryon app
        </button>
        {isIos && modalOpen && (
          <IosModal onClose={() => setModalOpen(false)} />
        )}
      </>
    );
  }

  // Navbar variant — only show if installable or iOS
  if (!showPrompt && !isIos) return null;

  return (
    <>
      <button
        onClick={() => isIos ? setModalOpen(true) : install()}
        className="flex items-center justify-center rounded-lg p-2 transition-colors text-white/60 hover:text-white hover:bg-white/5"
        aria-label="Install app"
      >
        <Download className="h-5 w-5" strokeWidth={1.5} />
      </button>
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
