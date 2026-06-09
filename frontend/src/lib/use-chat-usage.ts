"use client";

import { useState, useCallback } from "react";
import { useQueuedEffect } from "@/lib/use-queued-effect";
import { api } from "@/lib/api";

export interface ChatUsage {
  messages_used: number;
  limit: number;
  unlimited: boolean;
  plan: string;
  spend_usd?: number;
  spend_cap_usd?: number;
  tokens_used?: number;
  token_cap?: number;
  upgrade_plan?: string | null;
  at_limit?: boolean;
  near_limit?: boolean;
  reset_date?: string;
  usage_resets_label?: string;
  is_trial_period?: boolean;
}

export function useChatUsage() {
  const [usage, setUsage] = useState<ChatUsage | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<ChatUsage>("/api/chat/usage");
      setUsage(data);
    } catch { /* non-fatal */ }
  }, []);

  useQueuedEffect(() => { void load(); }, [load]);

  return { usage, reload: load };
}
