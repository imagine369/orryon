"use client";

import { PAID_PRICING_TIERS } from "@/lib/pricing-tiers";
import { PricingTierCard } from "@/components/pricing-tier-card";
import { useSubscription } from "@/lib/use-subscription";

export function UpgradePlansGrid() {
  const { sub } = useSubscription();
  const onAppTrial = sub?.plan === "trial";
  const currentPlan =
    onAppTrial || sub?.plan === "free" || sub?.plan === "past_due"
      ? null
      : sub?.plan;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 w-full">
      {onAppTrial && (
        <p className="lg:col-span-3 text-center text-sm text-white/45 -mb-1">
          You&apos;re on a free Pro trial. Subscribe now to lock in a plan — billing starts when you
          checkout (no extra trial period).
        </p>
      )}
      {PAID_PRICING_TIERS.map((tier) => (
        <PricingTierCard
          key={tier.id}
          tier={tier}
          context="in-app"
          currentPlan={currentPlan}
          onAppTrial={onAppTrial}
          trialTierId={onAppTrial ? "pro" : null}
        />
      ))}
    </div>
  );
}
