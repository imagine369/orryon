import { api } from "@/lib/api";

export type TierId = "pro" | "premium" | "premium_plus";
export type BillingPlan = "monthly" | "annual";

const PRICE_IDS: Record<TierId, Record<BillingPlan, string>> = {
  pro: {
    monthly: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY || "",
    annual: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_ANNUAL || "",
  },
  premium: {
    monthly: process.env.NEXT_PUBLIC_STRIPE_PRICE_PREMIUM_MONTHLY || "",
    annual: process.env.NEXT_PUBLIC_STRIPE_PRICE_PREMIUM_ANNUAL || "",
  },
  premium_plus: {
    monthly: process.env.NEXT_PUBLIC_STRIPE_PRICE_PREMIUM_PLUS_MONTHLY || "",
    annual: process.env.NEXT_PUBLIC_STRIPE_PRICE_PREMIUM_PLUS_ANNUAL || "",
  },
};

export function loginUrlForTier(tier: TierId, plan: BillingPlan): string {
  return `/login?tier=${tier}&plan=${plan}`;
}

/** Redirect to Stripe Checkout for an authenticated user. */
export async function startTierCheckout(
  tier: TierId,
  plan: BillingPlan,
  options?: { successUrl?: string; cancelUrl?: string },
): Promise<void> {
  const priceId = PRICE_IDS[tier]?.[plan];
  if (!priceId) {
    throw new Error("Stripe is not configured for this plan yet.");
  }
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const res = await api.post<{ checkout_url: string }>("/api/subscription/checkout", {
    price_id: priceId,
    success_url: options?.successUrl ?? `${origin}/home?upgraded=1`,
    cancel_url: options?.cancelUrl ?? `${origin}/pricing`,
  });
  window.location.href = res.checkout_url;
}
