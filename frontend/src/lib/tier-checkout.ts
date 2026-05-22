import { api } from "@/lib/api";
import { storeCheckoutIntent } from "@/lib/post-checkout";

export type TierId = "pro" | "premium" | "premium_plus";
export type BillingPlan = "monthly" | "annual";

const TIER_LABELS: Record<TierId, string> = {
  pro: "Pro",
  premium: "Premium",
  premium_plus: "Premium Plus",
};

/** Build-time fallback only — runtime prices come from GET /api/subscription/plans */
const ENV_PRICE_IDS: Record<TierId, Record<BillingPlan, string>> = {
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

type PlansApi = {
  plans: Record<TierId, { monthly: string | null; annual: string | null }>;
  warnings?: string[];
};

let cachedPlans: Record<TierId, Record<BillingPlan, string>> | null = null;

export function tierLabel(tier: TierId): string {
  return TIER_LABELS[tier];
}

export function loginUrlForTier(tier: TierId, plan: BillingPlan): string {
  return `/login?tier=${tier}&plan=${plan}`;
}

async function loadTierPlans(): Promise<Record<TierId, Record<BillingPlan, string>>> {
  if (cachedPlans) return cachedPlans;

  const merged = { ...ENV_PRICE_IDS } as Record<TierId, Record<BillingPlan, string>>;

  try {
    const res = await api.get<PlansApi>("/api/subscription/plans");
    for (const tier of Object.keys(res.plans) as TierId[]) {
      const row = res.plans[tier];
      if (row?.monthly) merged[tier].monthly = row.monthly;
      if (row?.annual) merged[tier].annual = row.annual;
    }
    if (res.warnings?.length && process.env.NODE_ENV !== "production") {
      console.warn("[tier-checkout] Stripe plan warnings:", res.warnings);
    }
  } catch (e) {
    console.warn("[tier-checkout] Could not load /api/subscription/plans, using env fallback", e);
  }

  // Detect misconfiguration: two tiers sharing one price_id → wrong Stripe product
  const byPrice: Record<string, TierId> = {};
  for (const tier of Object.keys(merged) as TierId[]) {
    for (const period of ["monthly", "annual"] as const) {
      const pid = merged[tier][period];
      if (!pid) continue;
      if (byPrice[pid] && byPrice[pid] !== tier) {
        throw new Error(
          `${TIER_LABELS[tier]} and ${TIER_LABELS[byPrice[pid]]} use the same Stripe price (${pid}). ` +
            "Set distinct STRIPE_PRICE_* values on Railway and redeploy.",
        );
      }
      byPrice[pid] = tier;
    }
  }

  cachedPlans = merged;
  return merged;
}

export async function resolveTierPriceId(tier: TierId, plan: BillingPlan): Promise<string> {
  const plans = await loadTierPlans();
  const priceId = plans[tier]?.[plan];
  if (!priceId) {
    throw new Error(
      `${TIER_LABELS[tier]} (${plan}) is not configured. ` +
        `Set STRIPE_PRICE_${tier.toUpperCase()}_${plan.toUpperCase()} on the backend.`,
    );
  }
  return priceId;
}

/** Redirect to Stripe Checkout for an authenticated user. */
export async function startTierCheckout(
  tier: TierId,
  plan: BillingPlan,
  options?: { successUrl?: string; cancelUrl?: string },
): Promise<void> {
  const priceId = await resolveTierPriceId(tier, plan);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const res = await api.post<{ checkout_url: string; plan?: string }>(
    "/api/subscription/checkout",
    {
      price_id: priceId,
      tier,
      success_url:
        options?.successUrl ?? `${origin}/home?upgraded=1&plan=${encodeURIComponent(tier)}`,
      cancel_url: options?.cancelUrl ?? `${origin}/upgrade`,
    },
  );
  if (res.plan && res.plan !== tier) {
    throw new Error(
      `Server returned ${res.plan} checkout for ${TIER_LABELS[tier]}. Check Stripe price IDs on Railway.`,
    );
  }
  storeCheckoutIntent(tier);
  window.location.href = res.checkout_url;
}
