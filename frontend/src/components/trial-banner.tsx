"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Subscription } from "@/lib/use-subscription";
import { UpgradeModal } from "@/components/upgrade-modal";

interface Props {
  sub: Subscription;
}

export function TrialBanner({ sub }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  // Only show for trial or free (expired trial) — not for active pro
  if (sub.plan === "pro" || dismissed) return null;

  const isExpired = sub.plan === "free";
  const daysLeft  = sub.trial_days_remaining;

  const message = isExpired
    ? "Your Pro trial has ended."
    : daysLeft <= 1
    ? "Last day of your Pro trial."
    : `${daysLeft} days left in your Pro trial.`;

  const urgency = isExpired || daysLeft <= 3;

  return (
    <>
      <div
        className="flex items-center justify-between px-4 py-2 text-xs"
        style={{
          background: urgency ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <span className="text-white/50 flex-1">{message}</span>
        <button
          onClick={() => setUpgradeOpen(true)}
          className="ml-3 shrink-0 text-white font-semibold underline underline-offset-2 hover:text-white/80 transition-colors"
        >
          Upgrade to Pro
        </button>
        {!isExpired && (
          <button
            onClick={() => setDismissed(true)}
            className="ml-2 shrink-0 text-white/30 hover:text-white/60 transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        )}
      </div>

      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </>
  );
}
