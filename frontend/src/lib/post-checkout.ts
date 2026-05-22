/** Survives history.replaceState during post-Stripe polling on /home. */
export const POST_CHECKOUT_SESSION_KEY = "orryon_post_checkout_pending";

/** Tier the user chose before redirecting to Stripe (pro | premium | premium_plus). */
export const CHECKOUT_EXPECTED_PLAN_KEY = "orryon_checkout_expected_plan";

export const PAID_PLAN_IDS = ["pro", "premium", "premium_plus"] as const;
export type PaidPlanId = (typeof PAID_PLAN_IDS)[number];

export const PLAN_DISPLAY: Record<string, string> = {
  pro: "Pro",
  premium: "Premium",
  premium_plus: "Premium Plus",
};

export function storeCheckoutIntent(tier: string) {
  try {
    sessionStorage.setItem(CHECKOUT_EXPECTED_PLAN_KEY, tier);
  } catch {
    /* ignore */
  }
}

export function readCheckoutIntent(): string | null {
  try {
    return sessionStorage.getItem(CHECKOUT_EXPECTED_PLAN_KEY);
  } catch {
    return null;
  }
}

export function clearCheckoutIntent() {
  try {
    sessionStorage.removeItem(CHECKOUT_EXPECTED_PLAN_KEY);
    sessionStorage.removeItem(POST_CHECKOUT_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function planDisplayName(plan: string | null | undefined): string {
  if (!plan) return "subscription";
  return PLAN_DISPLAY[plan] ?? plan.charAt(0).toUpperCase() + plan.slice(1).replace(/_/g, " ");
}

export function isPaidPlan(plan: string | null | undefined): plan is PaidPlanId {
  return !!plan && (PAID_PLAN_IDS as readonly string[]).includes(plan);
}

export function isCheckoutComplete(
  sub: { plan: string; has_stripe_subscription?: boolean } | null,
  expected: string | null,
): boolean {
  if (!sub?.has_stripe_subscription) return false;
  if (!isPaidPlan(sub.plan)) return false;
  if (expected && isPaidPlan(expected)) return sub.plan === expected;
  return true;
}
