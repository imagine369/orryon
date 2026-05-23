"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpRight, MessageSquare, Sparkles, X, Zap } from "lucide-react";

export type LimitKind = "messages" | "usage";

const PLAN_LABELS: Record<string, string> = {
  pro: "Pro",
  premium: "Premium",
  premium_plus: "Premium Plus",
};

const PLAN_PRICES: Record<string, number> = {
  pro: 22,
  premium: 33,
  premium_plus: 49,
};

interface UpgradeLimitModalProps {
  open: boolean;
  onClose: () => void;
  onUpgrade: () => void;
  kind: LimitKind;
  plan: string;
  upgradePlan?: string | null;
  messagesUsed?: number;
  messageLimit?: number;
  spendUsd?: number;
  spendCapUsd?: number;
}

export function UpgradeLimitModal({
  open,
  onClose,
  onUpgrade,
  kind,
  plan,
  upgradePlan,
  messagesUsed = 0,
  messageLimit = 0,
  spendUsd = 0,
  spendCapUsd = 0,
}: UpgradeLimitModalProps) {
  const resetDate = (() => {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return next.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  })();

  const nextLabel = upgradePlan ? PLAN_LABELS[upgradePlan] ?? upgradePlan : null;
  const nextPrice = upgradePlan ? PLAN_PRICES[upgradePlan] : null;
  const isUsage = kind === "usage";
  const usagePct =
    spendCapUsd > 0
      ? Math.min(100, Math.round((spendUsd / spendCapUsd) * 100))
      : 0;

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
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                {isUsage ? (
                  <Zap className="w-5 h-5 text-amber-400/90" strokeWidth={1.5} />
                ) : (
                  <MessageSquare className="w-5 h-5 text-amber-400/90" strokeWidth={1.5} />
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-white/85">
                  {isUsage ? "Monthly AI allowance reached" : "Monthly messages used"}
                </p>
                <p className="text-xs text-white/35 mt-0.5">
                  {isUsage && spendCapUsd > 0
                    ? `${usagePct}% used · resets ${resetDate}`
                    : messageLimit > 0
                      ? `${messagesUsed} / ${messageLimit} · resets ${resetDate}`
                      : `Resets ${resetDate}`}
                </p>
              </div>
            </div>

            <p className="text-sm text-white/50 leading-relaxed mb-5">
              {isUsage
                ? `You've used your ${PLAN_LABELS[plan] ?? plan} plan's AI budget for this month.`
                : `You've used all ${messageLimit} messages on your ${PLAN_LABELS[plan] ?? plan} plan.`}{" "}
              {nextLabel && nextPrice != null ? (
                <>
                  Upgrade to <strong className="text-white/70">{nextLabel}</strong> (${nextPrice}/mo)
                  for {nextLabel === "Premium" || nextLabel === "Premium Plus"
                    ? "unlimited messages and a larger AI allowance"
                    : "more messages and a higher AI allowance"}
                  .
                </>
              ) : (
                <>Your limits reset on {resetDate}.</>
              )}
            </p>

            <div className="space-y-2">
              {nextLabel && (
                <button
                  onClick={() => {
                    onClose();
                    onUpgrade();
                  }}
                  className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl bg-white text-black text-sm font-semibold hover:bg-white/90 transition"
                >
                  <span className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    Upgrade to {nextLabel}
                  </span>
                  <ArrowUpRight className="w-4 h-4" />
                </button>
              )}
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
