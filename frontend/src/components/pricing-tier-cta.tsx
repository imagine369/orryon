"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  loginUrlForTier,
  startTierCheckout,
  tierLabel,
  type BillingPlan,
  type TierId,
} from "@/lib/tier-checkout";
import { UPGRADE_PATH } from "@/lib/pricing-tiers";

export type CheckoutContext = "marketing" | "in-app";

type TierCtaProps = {
  tierId: TierId | "starter";
  label: string;
  popular: boolean;
  billing: BillingPlan;
  isFree: boolean;
  context?: CheckoutContext;
  disabled?: boolean;
};

export function PricingTierCta({
  tierId,
  label,
  popular,
  billing,
  isFree,
  context = "marketing",
  disabled = false,
}: TierCtaProps) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    if (disabled) return;
    if (isFree) {
      router.push("/login?step=email");
      return;
    }
    const tier = tierId as TierId;
    const origin = window.location.origin;
    const cancelPath = context === "in-app" ? UPGRADE_PATH : "/pricing";

    if (!authLoading && user) {
      setPending(true);
      setError(null);
      try {
        await startTierCheckout(tier, billing, {
          successUrl: `${origin}/home?upgraded=1`,
          cancelUrl: `${origin}${cancelPath}`,
        });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Checkout failed");
        setPending(false);
      }
      return;
    }
    router.push(loginUrlForTier(tier, billing));
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={pending || disabled}
        className="block w-full text-center rounded-xl py-3 text-base font-semibold transition-all duration-200 mb-7 disabled:opacity-50"
        style={
          popular
            ? {
                background: "rgba(168,85,247,0.25)",
                color: "rgba(216,180,254,0.95)",
                border: "1px solid rgba(168,85,247,0.35)",
              }
            : {
                background: "rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.75)",
                border: "1px solid rgba(255,255,255,0.10)",
              }
        }
      >
        {pending ? `Opening ${tierLabel(tierId as TierId)} checkout…` : label}
      </button>
      {error && (
        <p className="text-red-400/90 text-xs text-center -mt-5 mb-4">{error}</p>
      )}
    </div>
  );
}
