"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

export interface Subscription {
  plan: "trial" | "free" | "pro";
  trial_ends_at: string | null;
  trial_days_remaining: number;
  is_active_pro: boolean;
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
