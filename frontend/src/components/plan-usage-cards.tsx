"use client";

import Link from "next/link";
import {
  PRICING_TIERS,
  UPGRADE_PATH,
  type TierDefinition,
} from "@/lib/pricing-tiers";
import type { TierId } from "@/lib/tier-checkout";
import type { Subscription } from "@/lib/use-subscription";
import { formatUsageResetLabel } from "@/lib/format-usage-reset";
import { cn } from "@/lib/utils";

const TIER_BY_PLAN: Record<string, TierId | "trial" | "free" | null> = {
  trial: "trial",
  pro: "pro",
  premium: "premium",
  premium_plus: "premium_plus",
  free: "free",
  past_due: "free",
  starter: "free",
};

const UPGRADE_TARGET: Partial<Record<string, TierId>> = {
  free: "pro",
  past_due: "pro",
  trial: "premium",
  pro: "premium",
  premium: "premium_plus",
};

const UPGRADE_TAGLINE: Record<TierId, string> = {
  pro: "Full Life OS chat, budget, health, calendar, and 3,000 messages per month.",
  premium: "Speak to Orryon in chat, unlimited messages, and a larger monthly AI pool.",
  premium_plus:
    "Hear Orryon speak replies, maximum included usage, and priority support.",
};

function tierForId(id: TierId): TierDefinition {
  const t = PRICING_TIERS.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown tier ${id}`);
  return t;
}

function trialResetLabel(sub: Subscription): string {
  if (!sub.trial_ends_at) {
    return `${sub.trial_days_remaining} day${sub.trial_days_remaining !== 1 ? "s" : ""} left on trial`;
  }
  try {
    const end = new Date(sub.trial_ends_at);
    const date = end.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const days = sub.trial_days_remaining;
    return `Trial ends ${date}${days >= 0 ? ` (${days} day${days !== 1 ? "s" : ""})` : ""}`;
  } catch {
    return `${sub.trial_days_remaining} day${sub.trial_days_remaining !== 1 ? "s" : ""} left on trial`;
  }
}

function currentPlanTitle(sub: Subscription): string {
  switch (sub.plan) {
    case "trial":
      return "Pro trial";
    case "pro":
      return "Pro";
    case "premium":
      return "Premium";
    case "premium_plus":
      return "Premium Plus";
    case "past_due":
      return "Past due";
    default:
      return "Free";
  }
}

function currentPriceLabel(sub: Subscription): string {
  if (sub.plan === "free" || sub.plan === "past_due") return "$0";
  if (sub.plan === "trial") return "$0 during trial";
  const tier = TIER_BY_PLAN[sub.plan];
  if (!tier || tier === "trial" || tier === "free") return "";
  const t = tierForId(tier);
  return `$${t.monthlyPrice}/mo`;
}

interface PlanUsageCardsProps {
  sub: Subscription;
  usageResetsLabel?: string;
  manageLoading?: boolean;
  onManageBilling?: () => void;
}

export function PlanUsageCards({
  sub,
  usageResetsLabel,
  manageLoading,
  onManageBilling,
}: PlanUsageCardsProps) {
  const upgradeId = UPGRADE_TARGET[sub.plan];
  const upgradeTier = upgradeId ? tierForId(upgradeId) : null;
  const showManage =
    sub.has_stripe_subscription &&
    (sub.plan === "pro" ||
      sub.plan === "premium" ||
      sub.plan === "premium_plus" ||
      sub.plan === "past_due");

  const billingReset =
    sub.reset_date && !sub.is_trial_period
      ? formatUsageResetLabel(sub.reset_date)
      : null;

  const resetSublabel =
    sub.plan === "free" || sub.plan === "past_due"
      ? "Subscribe to unlock Orryon"
      : billingReset ||
        usageResetsLabel ||
        (sub.plan === "trial"
          ? trialResetLabel(sub)
          : sub.reset_date
            ? formatUsageResetLabel(sub.reset_date, sub.is_trial_period)
            : sub.usage_resets_label) ||
        "Usage resets on your billing date";

  return (
    <div className="px-3 pt-4 pb-3 border-b border-white/5 space-y-3">
      <p className="text-sm font-medium text-white/85">Plan &amp; Usuage</p>

      <div
        className={cn(
          "grid gap-3",
          upgradeTier ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1",
        )}
      >
        {/* Current plan */}
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 flex flex-col min-h-[140px]">
          <p className="text-[10px] font-medium tracking-wider text-white/35 uppercase">
            Current plan
          </p>
          <p className="mt-2 text-lg font-semibold text-white/95 leading-tight">
            {currentPlanTitle(sub)}{" "}
            <span className="text-white/55 font-medium">{currentPriceLabel(sub)}</span>
          </p>
          <p className="mt-1.5 text-xs text-white/40 flex-1">{resetSublabel}</p>
          {showManage && onManageBilling ? (
            <button
              type="button"
              onClick={onManageBilling}
              disabled={manageLoading}
              className="mt-3 self-start px-3 py-1.5 text-xs text-white/75 border border-white/15 rounded-lg
                bg-white/[0.04] hover:bg-white/[0.08] transition disabled:opacity-40"
            >
              {manageLoading ? "Opening…" : "Manage"}
            </button>
          ) : sub.plan === "free" || sub.plan === "trial" ? (
            <Link
              href={UPGRADE_PATH}
              className="mt-3 self-start px-3 py-1.5 text-xs text-white/75 border border-white/15 rounded-lg
                bg-white/[0.04] hover:bg-white/[0.08] transition"
            >
              {sub.plan === "trial" ? "Subscribe" : "View plans"}
            </Link>
          ) : !upgradeTier ? (
            <Link
              href={UPGRADE_PATH}
              className="mt-3 self-start px-3 py-1.5 text-xs text-white/75 border border-white/15 rounded-lg
                bg-white/[0.04] hover:bg-white/[0.08] transition"
            >
              All plans
            </Link>
          ) : null}
        </div>

        {/* Upgrade */}
        {upgradeId && upgradeTier && (
          <div className="rounded-xl border border-sky-500/20 bg-sky-500/[0.04] p-4 flex flex-col min-h-[140px]">
            <p className="text-[10px] font-medium tracking-wider text-white/35 uppercase">
              Upgrade available
            </p>
            <p className="mt-2 text-lg font-semibold text-white/95 leading-tight">
              {upgradeTier.name}{" "}
              <span className="text-white/55 font-medium">
                ${upgradeTier.monthlyPrice}/mo
              </span>
            </p>
            <p className="mt-1.5 text-xs text-white/40 flex-1 leading-relaxed">
              {UPGRADE_TAGLINE[upgradeId]}
            </p>
            <Link
              href={UPGRADE_PATH}
              className="mt-3 self-start px-3 py-1.5 text-xs font-semibold text-[#0a0a0a]
                bg-sky-300 hover:bg-sky-200 rounded-lg transition"
            >
              Upgrade
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
