"use client";

import { motion } from "framer-motion";
import { X } from "lucide-react";
import { AndroidInstallInstructions } from "@/components/app-install-instructions";
import { OrryonAvatar } from "@/components/orryon-avatar";

export function AndroidInstallModal({ onClose }: { onClose: () => void }) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-[220] bg-black"
        onClick={onClose}
        aria-hidden
      />
      <motion.div
        role="dialog"
        aria-modal
        aria-labelledby="android-install-title"
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 32 }}
        className="fixed inset-x-0 bottom-0 z-[221] mx-auto w-full max-w-lg sm:inset-x-4 sm:bottom-[max(1.5rem,env(safe-area-inset-bottom))] sm:max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rounded-t-3xl sm:rounded-2xl border border-white/15 bg-black px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6 shadow-[0_-8px_40px_rgba(0,0,0,0.8)] max-h-[min(92vh,640px)] overflow-y-auto">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20 sm:hidden" aria-hidden />

          <div className="flex items-start justify-between gap-3 mb-5">
            <div className="flex items-center gap-3 min-w-0">
              <OrryonAvatar size={48} className="ring-1 ring-white/15 shrink-0" />
              <div className="min-w-0 text-left">
                <p id="android-install-title" className="text-lg font-semibold text-white leading-tight">
                  Install on Android
                </p>
                <p className="text-sm text-white/55 mt-1 leading-snug">
                  Add Orryon to your home screen from Chrome
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 hover:bg-white/15 transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5 text-white/70" strokeWidth={1.5} />
            </button>
          </div>

          <p className="mb-5 text-sm text-white/60 text-left leading-relaxed">
            If the one-tap install button didn&apos;t appear, use Chrome&apos;s menu to add Orryon
            to your home screen.
          </p>

          <AndroidInstallInstructions />

          <button
            type="button"
            onClick={onClose}
            className="w-full mt-5 py-3.5 text-base font-semibold text-black bg-white rounded-xl hover:bg-white/90 active:scale-[0.99] transition"
          >
            Got it
          </button>
        </div>
      </motion.div>
    </>
  );
}
