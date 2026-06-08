"use client";

import { useCallback, useState } from "react";
import type { PlanLimitDetail } from "@/lib/api";
import type { LimitKind } from "@/components/upgrade-limit-modal";
import type { ChatUsage } from "@/lib/use-chat-usage";

export interface PlanLimitModalState {
  kind: LimitKind;
  plan: string;
  upgradePlan?: string | null;
  messagesUsed: number;
  messageLimit: number;
  spendUsd: number;
  spendCapUsd: number;
}

export function usePlanLimitModal(plan: string | undefined, chatUsage: ChatUsage | null) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<PlanLimitModalState | null>(null);

  const openModal = useCallback(
    (detail: PlanLimitDetail) => {
      const isUsage = detail.code === "usage_limit_reached";
      setInfo({
        kind: isUsage ? "usage" : "messages",
        plan: detail.plan ?? plan ?? "pro",
        upgradePlan: detail.upgrade_plan ?? null,
        messagesUsed: detail.messages_used ?? chatUsage?.messages_used ?? 0,
        messageLimit: detail.limit ?? chatUsage?.limit ?? 0,
        spendUsd: detail.spend_usd ?? chatUsage?.spend_usd ?? 0,
        spendCapUsd: detail.cap_usd ?? chatUsage?.spend_cap_usd ?? 0,
      });
      setOpen(true);
    },
    [plan, chatUsage],
  );

  return { open, setOpen, info, openModal };
}
