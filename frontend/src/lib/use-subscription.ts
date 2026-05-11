"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

export interface Subscription {
  plan: "trial" | "free" | "starter" | "pro" | "premium" | "past_due";
  trial_ends_at: string | null;
  trial_days_remaining: number;
  is_active_pro: boolean;
  /** True for plan="free" or "past_due" — no AI concierge access. */
  is_free_tier: boolean;
}

export function useSubscription() {
  const [sub, setSub] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  /**
   * True only when the /api/subscription fetch failed with a network or
   * server error — distinct from sub===null meaning "genuinely free tier".
   * AppShell uses this to avoid redirecting a Pro user to /breathe just
   * because of a transient backend hiccup.
   */
  const [fetchError, setFetchError] = useState(false);

  const refresh = useCallback(() => {
    api.get<Subscription>("/api/subscription")
      .then((s) => { setSub(s); setFetchError(false); })
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { sub, loading, fetchError, refresh };
}
