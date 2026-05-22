"use client";

/**
 * SubscriptionService
 *
 * Single source of truth for upgrade flows. Wrap the app in
 * `<SubscriptionProvider>`, then any component can call:
 *
 *   const sub = useSubscriptionService();
 *   sub.showPaywall("trigger-name");      // open the paywall overlay
 *   sub.startCheckout("monthly");         // jump straight to Stripe
 *
 * The paywall lives at the provider level (rendered via React portal in the
 * Paywall component itself) so it floats above any panel, modal, or
 * full-screen breathing session — and survives route changes within the app.
 *
 * Philosophy: breathing & meditation are FREE forever. The paywall is for
 * money-management features only. The copy in the Paywall component reflects
 * that — keep it warm and inclusive when editing.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Paywall } from "@/components/subscription/paywall";
import { api } from "@/lib/api";

export type CheckoutPlan = "monthly" | "annual";

interface PaywallState {
  open: boolean;
  /** Optional analytics/UX tag describing what triggered the paywall. */
  reason?: string;
}

export interface SubscriptionServiceValue {
  /** Open the paywall overlay. Pass an optional reason for analytics. */
  showPaywall: (reason?: string) => void;
  /** Close the paywall overlay. */
  hidePaywall: () => void;
  /** Whether the paywall is currently visible. */
  isPaywallOpen: boolean;
  /** Last reason supplied to showPaywall (for instrumentation). */
  paywallReason?: string;
  /** Kick off a Stripe Checkout session and redirect the browser to it. */
  startCheckout: (plan: CheckoutPlan) => Promise<void>;
  /** In-app plan picker (Pro / Premium / Premium Plus). */
  openUpgradePlans: () => void;
  /** True while a checkout call is in-flight. */
  checkoutPending: boolean;
  /** Non-null when the last checkout attempt failed. Cleared on next attempt. */
  checkoutError: string | null;
}

const SubscriptionContext = createContext<SubscriptionServiceValue | null>(null);

const MONTHLY_PRICE_ID = process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY ?? "";
const ANNUAL_PRICE_ID  = process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_ANNUAL  ?? "";

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PaywallState>({ open: false });
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const showPaywall = useCallback((reason?: string) => {
    setState({ open: true, reason });
    setCheckoutError(null);
  }, []);

  const hidePaywall = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
    setCheckoutError(null);
  }, []);

  const openUpgradePlans = useCallback(() => {
    window.location.href = "/upgrade";
  }, []);

  const startCheckout = useCallback(async (plan: CheckoutPlan) => {
    const priceId = plan === "annual" ? ANNUAL_PRICE_ID : MONTHLY_PRICE_ID;

    // No Stripe configured (dev / self-hosted) → fall through to the legacy
    // login route which can also drive provisioning. Mirrors trial-banner.tsx.
    if (!priceId) {
      window.location.href = "/upgrade";
      return;
    }

    setCheckoutPending(true);
    setCheckoutError(null);
    const timeoutId = setTimeout(() => {
      setCheckoutError("Request timed out. Please try again.");
      setCheckoutPending(false);
    }, 15_000);
    try {
      const origin = window.location.origin;
      const res = await api.post<{ checkout_url: string }>(
        "/api/subscription/checkout",
        {
          price_id: priceId,
          success_url: `${origin}/home?upgraded=1`,
          cancel_url: `${origin}/home`,
        },
      );
      clearTimeout(timeoutId);
      window.location.href = res.checkout_url;
    } catch (e) {
      clearTimeout(timeoutId);
      const msg =
        e instanceof Error ? e.message : "Something went wrong. Please try again.";
      setCheckoutError(msg);
      setCheckoutPending(false);
    }
  }, []);

  const value = useMemo<SubscriptionServiceValue>(
    () => ({
      showPaywall,
      hidePaywall,
      isPaywallOpen: state.open,
      paywallReason: state.reason,
      startCheckout,
      openUpgradePlans,
      checkoutPending,
      checkoutError,
    }),
    [
      showPaywall,
      hidePaywall,
      state.open,
      state.reason,
      startCheckout,
      openUpgradePlans,
      checkoutPending,
      checkoutError,
    ],
  );

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
      <Paywall
        open={state.open}
        reason={state.reason}
        onClose={hidePaywall}
        onCheckout={startCheckout}
        checkoutPending={checkoutPending}
        checkoutError={checkoutError}
      />
    </SubscriptionContext.Provider>
  );
}

export function useSubscriptionService(): SubscriptionServiceValue {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) {
    throw new Error(
      "useSubscriptionService must be used inside <SubscriptionProvider>.",
    );
  }
  return ctx;
}
