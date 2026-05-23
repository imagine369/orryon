"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { BillingPeriodToggle } from "@/components/billing-period-toggle";
import type { TierDefinition } from "@/lib/pricing-tiers";
import type { Billing } from "@/lib/pricing-tiers";
import { PricingTierCta } from "@/components/pricing-tier-cta";
import type { CheckoutContext } from "@/components/pricing-tier-cta";

export function PricingTierCard({
  tier,
  context,
  currentPlan,
  onAppTrial = false,
  trialTierId = null,
}: {
  tier: TierDefinition;
  context: CheckoutContext;
  currentPlan?: string | null;
  /** User has in-app Pro trial (not yet on Stripe). */
  onAppTrial?: boolean;
  trialTierId?: string | null;
}) {
  const [billing, setBilling] = useState<Billing>("monthly");
  const Icon = tier.icon;
  const isFree = tier.monthlyPrice === 0;
  const isCurrent = currentPlan === tier.id;
  const isTrialTier = onAppTrial && trialTierId === tier.id;

  const displayPrice = isFree
    ? "Free"
    : billing === "monthly"
      ? `$${tier.monthlyPrice}`
      : `$${tier.annualMonthly.toFixed(2).replace(/\.00$/, "")}`;

  const ctaLabel = isCurrent
    ? "Current plan"
    : isTrialTier
      ? "Subscribe now"
      : context === "in-app" && tier.id === "pro"
        ? "Upgrade to Pro"
        : context === "in-app"
          ? `Upgrade to ${tier.name}`
          : tier.cta;

  return (
    <div
      className="relative flex flex-col rounded-2xl p-7"
      style={{
        background: tier.popular
          ? "linear-gradient(160deg, rgba(168,85,247,0.12) 0%, rgba(255,255,255,0.03) 100%)"
          : "rgba(255,255,255,0.025)",
        border: `1px solid ${tier.popular ? "rgba(168,85,247,0.30)" : "rgba(255,255,255,0.07)"}`,
        opacity: isCurrent ? 0.85 : 1,
      }}
    >
      {tier.popular && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
          <span
            className="text-xs uppercase tracking-widest font-semibold px-4 py-1 rounded-full"
            style={{
              background: "rgba(168,85,247,0.25)",
              color: "rgba(192,132,252,0.95)",
              border: "1px solid rgba(168,85,247,0.30)",
            }}
          >
            Most Popular
          </span>
        </div>
      )}

      {(isCurrent || isTrialTier) && (
        <div className="absolute top-4 right-4">
          <span className="text-[0.65rem] uppercase tracking-wider text-white/50 border border-white/15 rounded-full px-2 py-0.5">
            {isTrialTier ? "Trial" : "Current"}
          </span>
        </div>
      )}

      <div className="flex items-center gap-3 mb-2">
        <div
          className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
          style={{ background: tier.accentBg, border: `1px solid ${tier.accentBorder}` }}
        >
          <Icon className={`w-5 h-5 ${tier.iconColor}`} strokeWidth={1.5} />
        </div>
        <p className="text-white font-bold text-xl">{tier.name}</p>
      </div>

      <p className={`text-white/50 text-sm leading-relaxed ${isFree ? "mb-6" : "mb-4"}`}>
        {tier.tagline}
      </p>

      {!isFree && (
        <div className="mb-4">
          <BillingPeriodToggle billing={billing} onChange={setBilling} />
        </div>
      )}

      <div className="mb-6">
        <div className="flex items-end gap-1.5">
          <span className="text-white font-bold" style={{ fontSize: "2.75rem", lineHeight: 1 }}>
            {displayPrice}
          </span>
          {!isFree && <span className="text-white/45 text-lg mb-1.5">/mo</span>}
        </div>
        {!isFree && billing === "annual" && (
          <p className="text-white/60 text-sm mt-2 font-medium">
            ${tier.annualTotal} billed annually · save 25%
          </p>
        )}
        {!isFree && billing === "monthly" && (
          <p className="text-white/45 text-sm mt-2">
            or ${tier.annualMonthly.toFixed(2).replace(/\.00$/, "")}/mo · billed ${tier.annualTotal}/yr
          </p>
        )}
        {isFree && <p className="text-white/40 text-sm mt-2">No credit card required</p>}
      </div>

      <PricingTierCta
        tierId={tier.id}
        label={ctaLabel}
        popular={tier.popular}
        billing={billing}
        isFree={isFree}
        context={context}
        disabled={isCurrent}
      />

      <div className="border-t mb-6" style={{ borderColor: "rgba(255,255,255,0.06)" }} />

      <ul className="space-y-3 flex-1">
        {tier.features.map((f) => (
          <li key={f} className="flex items-start gap-3 text-sm text-white/65 leading-snug">
            <Check className="w-4 h-4 text-white/35 shrink-0 mt-0.5" strokeWidth={2.5} />
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}
