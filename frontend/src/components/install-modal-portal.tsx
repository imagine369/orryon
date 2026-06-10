"use client";

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { useQueuedEffect } from "@/lib/use-queued-effect";

interface InstallModalPortalProps {
  onClose: () => void;
  children: ReactNode;
  /** Optional id for aria-labelledby on the dialog surface */
  labelledBy?: string;
}

/**
 * Bottom-sheet install dialog portaled to document.body so it is never trapped
 * under sticky nav / landing overlays (which blocked taps on mobile).
 */
export function InstallModalPortal({ onClose, children, labelledBy }: InstallModalPortalProps) {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useQueuedEffect(() => {
    setContainer(document.body);
  }, []);

  useQueuedEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (!container) return null;

  return createPortal(
    <div className="fixed inset-0 z-[300] isolate" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/90 touch-manipulation"
        onClick={onClose}
        aria-label="Close install instructions"
      />
      <div className="pointer-events-none relative z-[1] flex min-h-full items-end justify-center sm:items-center sm:p-4">
        <motion.div
          role="dialog"
          aria-modal
          aria-labelledby={labelledBy}
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
          className="pointer-events-auto w-full max-w-lg sm:max-w-md touch-manipulation"
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </motion.div>
      </div>
    </div>,
    container,
  );
}
