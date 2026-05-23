"use client";

import { cn } from "@/lib/utils";
import { formatUsageResetLabel } from "@/lib/format-usage-reset";
import type { ChatUsage } from "@/lib/use-chat-usage";

const PLAN_DISPLAY: Record<string, string> = {
  trial: "Pro",
  pro: "Pro",
  premium: "Premium",
  premium_plus: "Premium Plus",
  starter: "Starter",
  free: "Free",
};

interface AiAllowanceMeterProps {
  usage: ChatUsage;
  plan?: string;
  embedded?: boolean;
  className?: string;
}

function pctUsed(used: number, cap: number): number | null {
  if (cap <= 0) return null;
  return Math.min(100, Math.round((used / cap) * 100));
}

/** Included usage — percent bar only (no token/dollar breakdown). */
export function AiAllowanceMeter({ usage, plan, embedded, className }: AiAllowanceMeterProps) {
  const spendCap = usage.spend_cap_usd ?? 0;
  const spent = usage.spend_usd ?? 0;
  if (spendCap <= 0) return null;

  const totalPct = pctUsed(spent, spendCap) ?? 0;
  const planName = PLAN_DISPLAY[plan ?? usage.plan ?? ""] ?? "your plan";
  const isAtLimit = usage.at_limit || totalPct >= 100;
  const resetLabel = usage.reset_date
    ? formatUsageResetLabel(usage.reset_date, usage.is_trial_period)
    : usage.usage_resets_label;

  return (
    <div className={cn("space-y-2", className)}>
      {!embedded && (
        <p className="text-xs text-white/40">Included AI usage · {planName}</p>
      )}

      <div
        className={cn(
          "rounded-xl border border-white/[0.08] bg-white/[0.04] p-3.5 space-y-3",
          embedded && "border-0 bg-transparent p-0",
        )}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-white/90">
            {embedded ? "Included usage" : "Monthly allowance"}
          </span>
          <span
            className={cn(
              "text-sm font-medium tabular-nums",
              isAtLimit ? "text-amber-400/90" : "text-white/90",
            )}
          >
            {totalPct}%
          </span>
        </div>

        <div className="h-2 w-full rounded-full bg-black/40 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              isAtLimit ? "bg-amber-500" : "bg-emerald-500",
            )}
            style={{ width: `${Math.max(totalPct, totalPct > 0 ? 3 : 0)}%` }}
          />
        </div>

        {resetLabel && (
          <p className="text-xs text-white/35">{resetLabel}</p>
        )}
      </div>
    </div>
  );
}
