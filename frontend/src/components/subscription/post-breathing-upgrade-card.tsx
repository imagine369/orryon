"use client";

/**
 * PostBreathingUpgradeCard
 *
 * Subscription-aware "Ready to bring the same peace to your finances?"
 * nudge. Designed to be passed into `<BreathingWidget doneFooterSlot={...}>`.
 *
 * Lives in the subscription module because it depends on subscription
 * state and triggers the paywall. Breathing never imports it — that's
 * the whole point of the slot pattern.
 *
 * Hides itself for users who already have an active Pro subscription, so
 * they never see an upsell after meditating.
 */

import { Sparkles } from "lucide-react";
import { useSubscriptionService } from "@/lib/subscription-service";
import { useSubscription } from "@/lib/use-subscription";

interface Props {
  /** Analytics tag — defaults to a sensible value. */
  reason?: string;
  className?: string;
}

export function PostBreathingUpgradeCard({
  reason = "post-breathing",
  className = "",
}: Props) {
  const { showPaywall } = useSubscriptionService();
  const { sub } = useSubscription();

  // Pro users get nothing here — breathing already showed the wellbeing
  // thank-you. They never see an upsell after meditating.
  if (sub?.is_active_pro) return null;

  return (
    <div
      className={
        "flex flex-col items-center text-center max-w-[320px] mx-auto " +
        className
      }
      style={{
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <p
        style={{
          color: "rgba(255,255,255,.32)",
          fontSize: "0.74rem",
          lineHeight: 1.6,
          marginBottom: "0.9rem",
        }}
      >
        Ready to bring the same peace to your finances?
      </p>

      <button
        onClick={() => showPaywall(reason)}
        className="group inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[0.7rem] font-semibold uppercase tracking-[2.5px] text-white/85 hover:text-white border border-white/15 hover:border-white/30 bg-white/[0.05] hover:bg-white/[0.10] transition-all"
      >
        <Sparkles
          className="h-3 w-3 text-white/70 group-hover:text-white"
          strokeWidth={1.8}
        />
        Unlock financial peace
      </button>
    </div>
  );
}
