"use client";

import { ArrowUpRight, Zap } from "lucide-react";
import type { ChatUsage } from "@/lib/use-chat-usage";

const PLAN_LABELS: Record<string, string> = {
  pro: "Pro",
  premium: "Premium",
  premium_plus: "Premium Plus",
};

interface UsageUpgradeBannerProps {
  usage: ChatUsage | null;
  onUpgrade: () => void;
}

/**
 * Shown above chat when the user is near or at their monthly API allowance.
 */
export function UsageUpgradeBanner({ usage, onUpgrade }: UsageUpgradeBannerProps) {
  if (!usage) return null;

  const cap = usage.spend_cap_usd ?? 0;
  const spent = usage.spend_usd ?? 0;
  if (cap <= 0) return null;

  const pct = Math.min(100, Math.round((spent / cap) * 100));
  const atLimit = usage.at_limit || spent >= cap;
  const nearLimit = usage.near_limit || (pct >= 80 && !atLimit);

  if (!atLimit && !nearLimit) return null;

  const upgradePlan = usage.upgrade_plan;
  const upgradeLabel = upgradePlan ? PLAN_LABELS[upgradePlan] ?? upgradePlan : null;

  return (
    <div
      className={`mx-auto w-full max-w-3xl px-4 mb-2 rounded-2xl border px-4 py-3 flex items-center gap-3 ${
        atLimit
          ? "bg-amber-500/10 border-amber-500/25"
          : "bg-white/[0.03] border-white/[0.08]"
      }`}
      role="status"
    >
      <Zap
        className={`h-4 w-4 shrink-0 ${atLimit ? "text-amber-400" : "text-white/40"}`}
        strokeWidth={1.5}
      />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${atLimit ? "text-amber-100/90" : "text-white/70"}`}>
          {atLimit
            ? "Monthly AI allowance reached"
            : `${pct}% of your monthly AI allowance used`}
        </p>
        <p className="text-xs text-white/40 mt-0.5 truncate">
          ${spent.toFixed(2)} of ${cap.toFixed(2)} · resets on the 1st
          {upgradeLabel ? ` · Upgrade to ${upgradeLabel} for more` : ""}
        </p>
      </div>
      {upgradeLabel && (
        <button
          type="button"
          onClick={onUpgrade}
          className="shrink-0 flex items-center gap-1 text-xs font-semibold text-amber-200/90 hover:text-amber-100 transition"
        >
          Upgrade
          <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
