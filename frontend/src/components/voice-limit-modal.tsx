"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mic, MicOff, ArrowUpRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { startVoiceTopup } from "@/lib/use-voice-usage";

interface VoiceLimitModalProps {
  open: boolean;
  onClose: () => void;
  /** Called when the user chooses "Continue with text". */
  onContinueText: () => void;
  /** Called when the user wants to upgrade their plan. */
  onUpgrade: () => void;
  minutesUsed?: number;
  limitMinutes?: number;
}

/**
 * Shown when the user hits their monthly voice-minute cap.
 * Offers three non-punitive paths forward — all within the existing brand.
 */
export function VoiceLimitModal({
  open,
  onClose,
  onContinueText,
  onUpgrade,
  minutesUsed,
  limitMinutes,
}: VoiceLimitModalProps) {
  const [toppingUp, setToppingUp] = useState(false);

  const handleTopup = async () => {
    setToppingUp(true);
    try {
      await startVoiceTopup();
      // startVoiceTopup redirects the browser; execution stops here on success.
    } catch {
      setToppingUp(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            key="sheet"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-x-4 bottom-6 z-50 mx-auto max-w-sm rounded-3xl bg-[#141414] border border-white/[0.09] p-6 shadow-2xl"
          >
            {/* Close */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-white/30 hover:text-white/60 transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Icon */}
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.07]">
              <MicOff className="w-5 h-5 text-white/50" strokeWidth={1.5} />
            </div>

            {/* Heading */}
            <h2 className="text-base font-medium text-white/90 leading-snug mb-1">
              All voice minutes used
            </h2>
            <p className="text-sm text-white/45 leading-relaxed mb-6">
              You&apos;ve used all your included voice minutes this month. Orryon has
              been talking with you a lot!
              {minutesUsed !== undefined && limitMinutes !== undefined && (
                <span className="block mt-1 text-white/30 text-xs tabular-nums">
                  {Math.round(minutesUsed)}&thinsp;/&thinsp;{limitMinutes} min used
                </span>
              )}
            </p>

            {/* Options */}
            <div className="flex flex-col gap-2.5">
              {/* Top-up CTA — primary */}
              <button
                onClick={handleTopup}
                disabled={toppingUp}
                className={cn(
                  "flex items-center justify-between w-full rounded-2xl bg-white/[0.08]",
                  "px-4 py-3.5 text-left transition-colors hover:bg-white/[0.12] active:bg-white/[0.06]",
                  toppingUp && "opacity-60 pointer-events-none"
                )}
              >
                <div>
                  <p className="text-sm font-medium text-white/90">
                    Add 60 more minutes
                  </p>
                  <p className="text-xs text-white/35 mt-0.5">
                    One-time · $6.00 · added instantly
                  </p>
                </div>
                {toppingUp ? (
                  <Loader2 className="w-4 h-4 text-white/30 animate-spin shrink-0" />
                ) : (
                  <ArrowUpRight className="w-4 h-4 text-white/30 shrink-0" />
                )}
              </button>

              {/* Upgrade plan */}
              <button
                onClick={() => { onUpgrade(); onClose(); }}
                className="flex items-center justify-between w-full rounded-2xl bg-white/[0.05]
                  px-4 py-3.5 text-left transition-colors hover:bg-white/[0.09] active:bg-white/[0.03]"
              >
                <div>
                  <p className="text-sm font-medium text-white/80">
                    Upgrade my plan
                  </p>
                  <p className="text-xs text-white/30 mt-0.5">
                    Get more included minutes every month
                  </p>
                </div>
                <ArrowUpRight className="w-4 h-4 text-white/25 shrink-0" />
              </button>

              {/* Continue text-only — lowest emphasis */}
              <button
                onClick={() => { onContinueText(); onClose(); }}
                className="w-full rounded-2xl px-4 py-3 text-center text-sm text-white/35
                  transition-colors hover:text-white/55 active:text-white/25"
              >
                Continue with text until next month
              </button>
            </div>

            {/* Footer */}
            <p className="mt-4 text-center text-[11px] text-white/20 leading-relaxed">
              Minutes reset on the 1st of each month.
            </p>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
