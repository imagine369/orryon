"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { api } from "@/lib/api";
import { Subscription } from "@/lib/use-subscription";

interface Props {
  sub: Subscription;
}

export function TrialBanner({ sub }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  const handleUpgrade = async () => {
    setUpgrading(true);
    setUpgradeError(null);
    try {
      const priceId =
        process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY ??
        process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY ??
        "";
      if (!priceId) {
        window.location.href = "/login?step=tiers";
        return;
      }
      const origin = window.location.origin;
      const res = await api.post<{ checkout_url: string }>("/api/subscription/checkout", {
        price_id: priceId,
        success_url: `${origin}/home?upgraded=1`,
        cancel_url: `${origin}/home`,
      });
      window.location.href = res.checkout_url;
    } catch (e) {
      setUpgradeError(e instanceof Error ? e.message : "Couldn't open checkout. Please try again.");
      setUpgrading(false);
    }
  };

  if (sub.plan === "pro" || dismissed) return null;

  const isExpired = sub.plan === "free" || sub.plan === "past_due";
  const daysLeft  = sub.trial_days_remaining;

  const message = sub.plan === "past_due"
    ? "Your payment failed. Please update your billing details."
    : isExpired
    ? "Your Pro trial has ended. Subscribe to continue."
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
        <span className="text-white/50 flex-1">{message}</span>

        <button
          onClick={handleUpgrade}
          disabled={upgrading}
          className="ml-3 shrink-0 text-white font-semibold underline underline-offset-2 hover:text-white/80 transition-colors disabled:opacity-50"
        >
          {upgrading ? "Opening…" : "Upgrade"}
        </button>

        {!isExpired && !urgency && (
          <button
            onClick={() => setDismissed(true)}
            className="ml-2 shrink-0 text-white/30 hover:text-white/60 transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        )}
      </div>

      {upgradeError && (
        <p className="mt-1 text-[0.7rem]" style={{ color: "rgba(255, 120, 100, 0.85)" }}>
          {upgradeError}
        </p>
      )}
    </div>
  );
}
