"use client";

import { motion } from "framer-motion";
import { X } from "lucide-react";
import { IosInstallInstructions } from "@/components/app-install-instructions";
import { OrryonAvatar } from "@/components/orryon-avatar";

export function IosInstallModal({ onClose }: { onClose: () => void }) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-[3px]"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="fixed inset-x-4 bottom-8 z-[61] mx-auto max-w-md"
      >
        <div>
          <div>
            <div>
              <OrryonAvatar size={40} className="ring-1 ring-white/[0.08]" />
              <p className="text-[15px] font-semibold text-white">Install on iPhone & iPad</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-colors"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5 text-white/50" strokeWidth={1.5} />
            </button>
          </div>
          <IosInstallInstructions />
          <button
            type="button"
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
