"use client";

import { useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { IosInstallInstructions } from "@/components/app-install-instructions";
import { InstallModalPortal } from "@/components/install-modal-portal";
import { OrryonAvatar } from "@/components/orryon-avatar";
import { isIosSafari } from "@/lib/platform";

export function IosInstallModal({ onClose }: { onClose: () => void }) {
  const inSafari = isIosSafari();
  const [copied, setCopied] = useState(false);

  async function copyPageUrl() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* private mode / denied */
    }
  }

  return (
    <InstallModalPortal onClose={onClose} labelledBy="ios-install-title">
      <div className="rounded-t-3xl sm:rounded-2xl border border-white/15 bg-black px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6 shadow-[0_-8px_40px_rgba(0,0,0,0.8)] max-h-[min(92vh,640px)] overflow-y-auto overscroll-contain">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20 sm:hidden" aria-hidden />

        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="flex items-center gap-3 min-w-0">
            <OrryonAvatar size={48} className="ring-1 ring-white/15 shrink-0" />
            <div className="min-w-0 text-left">
              <p id="ios-install-title" className="text-lg font-semibold text-white leading-tight">
                Install on iPhone & iPad
              </p>
              <p className="text-sm text-white/55 mt-1 leading-snug">
                Adds Orryon to your home screen like an app
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

        {!inSafari ? (
          <div className="mb-5 rounded-2xl border border-amber-400/30 bg-[#1a1408] p-4 text-left">
            <p className="text-base text-amber-50 font-semibold mb-2">Open in Safari first</p>
            <p className="text-sm text-white/70 leading-relaxed mb-4">
              Install only works in <span className="text-white font-medium">Safari</span> — not
              Chrome or in-app browsers. Copy this link, open Safari, paste it in the address
              bar, then follow the steps below.
            </p>
            <button
              type="button"
              onClick={() => void copyPageUrl()}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 py-3 text-sm font-semibold text-white hover:bg-white/15 transition touch-manipulation"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-green-400" strokeWidth={2} />
                  Link copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" strokeWidth={1.5} />
                  Copy link for Safari
                </>
              )}
            </button>
          </div>
        ) : (
          <p className="mb-5 text-sm text-white/60 text-left leading-relaxed">
            Use Safari&apos;s toolbar at the bottom of the screen — the steps below are not
            buttons in this popup.
          </p>
        )}

        <IosInstallInstructions large />

        <button
          type="button"
          onClick={onClose}
          className="w-full mt-5 min-h-[3rem] py-3.5 text-base font-semibold text-black bg-white rounded-xl hover:bg-white/90 active:scale-[0.99] transition touch-manipulation"
        >
          Got it
        </button>
      </div>
    </InstallModalPortal>
  );
}
