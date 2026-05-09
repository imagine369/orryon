"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

export interface Subscription {
  plan: "trial" | "free" | "starter" | "pro" | "premium";
  trial_ends_at: string | null;
  trial_days_remaining: number;
  is_active_pro: boolean;
  /** True for plan="free" — breathing-only tier, no AI concierge access. */
  is_free_tier: boolean;
}

export function useSubscription() {
  const [sub, setSub] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    api.get<Subscription>("/api/subscription")
      .then(setSub)
      .catch(() => setSub(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { sub, loading, refresh };
}
