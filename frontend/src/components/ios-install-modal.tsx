"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { IosInstallInstructions } from "@/components/app-install-instructions";
import { InstallModalPortal } from "@/components/install-modal-portal";
import { OrryonAvatar } from "@/components/orryon-avatar";
import { iosInstallUrl } from "@/lib/ios-install";

/** Safari on iPhone/iPad — guide users to the browser toolbar Share button (A2HS is not in Web Share API). */
export function IosSafariInstallModal({ onClose }: { onClose: () => void }) {
  return (
    <InstallModalPortal onClose={onClose} labelledBy="ios-safari-install-title">
      <div className="rounded-t-3xl sm:rounded-2xl border border-white/15 bg-black px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6 shadow-[0_-8px_40px_rgba(0,0,0,0.8)]">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20 sm:hidden" aria-hidden />

        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="flex items-center gap-3 min-w-0">
            <OrryonAvatar size={48} className="ring-1 ring-white/15 shrink-0" />
            <div className="min-w-0 text-left">
              <p id="ios-safari-install-title" className="text-lg font-semibold text-white leading-tight">
                Add to Home Screen
              </p>
              <p className="text-sm text-white/55 mt-1 leading-snug">
                Use Safari&apos;s Share button below
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

        <p className="mb-4 text-sm text-white/60 text-left leading-relaxed">
          Apple only allows home-screen install from Safari&apos;s toolbar — follow these steps:
        </p>

        <IosInstallInstructions large />

        <p className="mt-4 text-xs text-white/35 text-left leading-relaxed">
          The steps above are instructions only. Use the Share button on Safari&apos;s bottom bar, not inside this popup.
        </p>
      </div>
    </InstallModalPortal>
  );
}

/** Shown when iPhone users are not in Safari (Chrome, in-app browsers, etc.). */
export function IosInstallModal({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  async function copyPageUrl() {
    try {
      await navigator.clipboard.writeText(iosInstallUrl());
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2500);
    } catch {
      /* private mode / denied */
    }
  }

  return (
    <InstallModalPortal onClose={onClose} labelledBy="ios-install-title">
      <div className="rounded-t-3xl sm:rounded-2xl border border-white/15 bg-black px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6 shadow-[0_-8px_40px_rgba(0,0,0,0.8)]">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20 sm:hidden" aria-hidden />

        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="flex items-center gap-3 min-w-0">
            <OrryonAvatar size={48} className="ring-1 ring-white/15 shrink-0" />
            <div className="min-w-0 text-left">
              <p id="ios-install-title" className="text-lg font-semibold text-white leading-tight">
                Open in Safari
              </p>
              <p className="text-sm text-white/55 mt-1 leading-snug">
                iPhone install only works in Safari
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

        <p className="mb-5 text-sm text-white/60 text-left leading-relaxed">
          Copy this link, paste it in Safari, then tap <span className="text-white">Add to Home Screen</span>.
          The Orryon icon will appear on your home screen like any other app.
        </p>

        <button
          type="button"
          onClick={() => void copyPageUrl()}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3.5 text-base font-semibold text-black hover:bg-white/90 active:scale-[0.99] transition touch-manipulation"
        >
          {copied ? (
            <>
              <Check className="h-5 w-5 text-green-600" strokeWidth={2} />
              Copied — open Safari
            </>
          ) : (
            <>
              <Copy className="h-5 w-5" strokeWidth={1.5} />
              Copy link
            </>
          )}
        </button>
      </div>
    </InstallModalPortal>
  );
}
