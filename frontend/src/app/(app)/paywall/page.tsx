"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSubscriptionService } from "@/lib/subscription-service";
import { useSubscription } from "@/lib/use-subscription";

export default function PaywallPage() {
  const router = useRouter();
  const { showPaywall, isPaywallOpen } = useSubscriptionService();
  const { sub, loading } = useSubscription();
  // Tracks whether we've opened the overlay this mount, so we don't
  // mis-read the initial isPaywallOpen=false as "user closed it".
  const didOpen = useRef(false);

  // Already subscribed → nothing to show
  useEffect(() => {
    if (!loading && sub?.is_active_pro) {
      router.replace("/home");
    }
  }, [loading, sub, router]);

  // Open the overlay once auth + subscription state has resolved
  useEffect(() => {
    if (!loading && sub && !sub.is_active_pro && !didOpen.current) {
      didOpen.current = true;
      showPaywall("paywall-page");
    }
  }, [loading, sub, showPaywall]);

  // Overlay closed (user hit "Maybe later") → send them home
  useEffect(() => {
    if (didOpen.current && !isPaywallOpen) {
      router.replace("/home");
    }
  }, [isPaywallOpen, router]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
    </div>
  );
}
