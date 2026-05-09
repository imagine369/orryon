"use client";

import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, ArrowUpRight, X } from "lucide-react";

interface ChatLimitModalProps {
  open: boolean;
  onClose: () => void;
  onUpgrade: () => void;
  messagesUsed: number;
  limit: number;
  plan: string;
}

export function ChatLimitModal({
  open, onClose, onUpgrade, messagesUsed, limit, plan,
}: ChatLimitModalProps) {
  const resetDate = (() => {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return next.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  })();

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            key="modal"
            initial={{ opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 340, damping: 30 }}
            className="fixed inset-x-4 bottom-8 z-50 max-w-sm mx-auto rounded-3xl bg-[#111] border border-white/[0.08] p-6 shadow-2xl"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-white/25 hover:text-white/50 transition"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-white/40" strokeWidth={1.5} />
              </div>
              <div>
                <p className="text-sm font-semibold text-white/85">Monthly messages used</p>
                <p className="text-xs text-white/35 mt-0.5">
                  {messagesUsed} / {limit} · resets {resetDate}
                </p>
              </div>
            </div>

            <p className="text-sm text-white/50 leading-relaxed mb-5">
              You&apos;ve reached your {plan.charAt(0).toUpperCase() + plan.slice(1)} plan limit
              for this month. Upgrade to Pro for 500 messages, or Premium for unlimited.
            </p>

            <div className="space-y-2">
              <button
                onClick={() => { onClose(); onUpgrade(); }}
                className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl bg-white text-black text-sm font-semibold hover:bg-white/90 transition"
              >
                <span>Upgrade for more messages</span>
                <ArrowUpRight className="w-4 h-4" />
              </button>
              <button
                onClick={onClose}
                className="w-full py-3 text-sm text-white/30 hover:text-white/50 transition"
              >
                I&apos;ll wait until {resetDate}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
