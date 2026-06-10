"use client";

import { X } from "lucide-react";
import { InstallModalPortal } from "@/components/install-modal-portal";
import { OrryonAvatar } from "@/components/orryon-avatar";

export function AndroidInstallModal({ onClose }: { onClose: () => void }) {
  return (
    <InstallModalPortal onClose={onClose} labelledBy="android-install-title">
      <div className="rounded-t-3xl sm:rounded-2xl border border-white/15 bg-black px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6 shadow-[0_-8px_40px_rgba(0,0,0,0.8)]">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20 sm:hidden" aria-hidden />

        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <OrryonAvatar size={48} className="ring-1 ring-white/15 shrink-0" />
            <div className="min-w-0 text-left">
              <p id="android-install-title" className="text-lg font-semibold text-white leading-tight">
                Install Orryon
              </p>
              <p className="text-sm text-white/55 mt-1 leading-snug">
                Chrome menu → Install app
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 hover:bg-white/15 transition-colors touch-manipulation"
            aria-label="Close"
          >
            <X className="h-5 w-5 text-white/70" strokeWidth={1.5} />
          </button>
        </div>

        <p className="text-sm text-white/60 text-left leading-relaxed">
          Tap the <span className="text-white">⋮</span> menu in Chrome, then{" "}
          <span className="text-white">Install app</span>. Orryon will appear on your home screen.
        </p>
      </div>
    </InstallModalPortal>
  );
}
