"use client";

import { useState } from "react";
import { X } from "lucide-react";
import Link from "next/link";
import { UPGRADE_PATH } from "@/lib/pricing-tiers";
import { Subscription } from "@/lib/use-subscription";

interface Props {
  sub: Subscription;
}

export function TrialBanner({ sub }: Props) {
  const [dismissed, setDismissed] = useState(false);

  if (sub.plan === "pro" || dismissed) return null;

  const isExpired = sub.plan === "free" || sub.plan === "past_due";
  const daysLeft  = sub.trial_days_remaining;

  const message = sub.plan === "past_due"
    ? "Your payment failed. Please update your billing details."
    : isExpired
    ? "Your trial has ended. Subscribe to continue."
    : daysLeft <= 1
    ? "Last day of your free trial."
    : `${daysLeft} days left in your free trial.`;

  const urgency = isExpired || daysLeft <= 3;

  return (
    <div
      className="flex flex-col px-4 py-2 text-xs"
      style={{
        background: urgency ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="flex items-center justify-between">
        <Link
          href={UPGRADE_PATH}
          className={
            isExpired
              ? "text-white/70 hover:text-white flex-1 underline underline-offset-2 transition-colors"
              : "text-white/50 hover:text-white/70 flex-1 underline underline-offset-2 transition-colors"
          }
        >
          {isExpired ? message : `${message} Upgrade anytime.`}
        </Link>

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
    </div>
  );
}
