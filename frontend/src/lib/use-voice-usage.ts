"use client";

import { useCallback, useState } from "react";
import { useQueuedEffect } from "@/lib/use-queued-effect";
import { api } from "@/lib/api";

export interface VoiceUsage {
  seconds_used: number;
  minutes_used: number;
  limit_minutes: number;
  topup_minutes: number;
  total_available_minutes: number;
  remaining_minutes: number;
  plan: string;
  reset_date: string;
}

export function useVoiceUsage() {
  const [usage, setUsage] = useState<VoiceUsage | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    api
      .get<VoiceUsage>("/api/voice/usage")
      .then(setUsage)
      .catch(() => setUsage(null))
      .finally(() => setLoading(false));
  }, []);

  useQueuedEffect(() => refresh(), [refresh]);

  /** True when the user has exhausted their included + topup minutes. */
  const isAtLimit =
    usage !== null &&
    usage.total_available_minutes > 0 &&
    usage.remaining_minutes <= 0;

  /** 0–100 percentage of total minutes consumed. */
  const pctUsed =
    usage && usage.total_available_minutes > 0
      ? Math.min(100, Math.round((usage.minutes_used / usage.total_available_minutes) * 100))
      : 0;

  return { usage, loading, refresh, isAtLimit, pctUsed };
}

/** Kick off a voice top-up Stripe Checkout and redirect. */
export async function startVoiceTopup(): Promise<void> {
  const res = await api.post<{ checkout_url: string }>("/api/voice/topup", {});
  if (res.checkout_url) {
    window.location.href = res.checkout_url;
  }
}
