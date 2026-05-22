"use client";

import { PAID_PRICING_TIERS } from "@/lib/pricing-tiers";
import { PricingTierCard } from "@/components/pricing-tier-card";
import { useSubscription } from "@/lib/use-subscription";

export function UpgradePlansGrid() {
  const { sub } = useSubscription();
  const currentPlan =
    sub?.plan === "trial" || sub?.plan === "free" || sub?.plan === "past_due"
      ? null
      : sub?.plan;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 w-full">
      {PAID_PRICING_TIERS.map((tier) => (
        <PricingTierCard
          key={tier.id}
          tier={tier}
          context="in-app"
          currentPlan={currentPlan}
        />
      ))}
    </div>
  );
}
