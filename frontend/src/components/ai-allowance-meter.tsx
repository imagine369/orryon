"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
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
  /** Plan id for the "Included in …" heading */
  plan?: string;
  /** Inside PlanUsageSection — hide outer plan heading */
  embedded?: boolean;
  className?: string;
}

function pctUsed(used: number, cap: number): number | null {
  if (cap <= 0) return null;
  return Math.min(100, Math.round((used / cap) * 100));
}

/** Cursor-style included usage: Total %, green bar, optional breakdown. */
export function AiAllowanceMeter({ usage, plan, embedded, className }: AiAllowanceMeterProps) {
  const [expanded, setExpanded] = useState(false);

  const spendCap = usage.spend_cap_usd ?? 0;
  const spent = usage.spend_usd ?? 0;
  if (spendCap <= 0) return null;

  const totalPct = pctUsed(spent, spendCap) ?? 0;
  const messagePct =
    !usage.unlimited && (usage.limit ?? 0) > 0
      ? pctUsed(usage.messages_used ?? 0, usage.limit)
      : null;
  const tokenPct =
    (usage.token_cap ?? 0) > 0
      ? pctUsed(usage.tokens_used ?? 0, usage.token_cap ?? 0)
      : null;

  const planName = PLAN_DISPLAY[plan ?? usage.plan ?? ""] ?? "your plan";
  const isAtLimit = usage.at_limit || totalPct >= 100;

  const spendLabel =
    spendCap > 0
      ? `$${spent.toFixed(2)} of $${spendCap.toFixed(2)} this month`
      : null;

  const breakdownSummary = spendLabel ?? "View breakdown";
  const hasDetails =
    spendLabel !== null || messagePct !== null || tokenPct !== null;

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
            {embedded ? "Monthly pool" : "Monthly allowance"}
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

        <button
          type="button"
          onClick={() => hasDetails && setExpanded((v) => !v)}
          className={cn(
            "flex w-full items-center justify-between gap-2 text-left text-xs text-white/40",
            hasDetails && "hover:text-white/55 transition-colors",
          )}
          aria-expanded={hasDetails ? expanded : undefined}
          disabled={!hasDetails}
        >
          <span>{breakdownSummary}</span>
          {hasDetails && (
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-white/30 transition-transform",
                expanded && "rotate-180",
              )}
              strokeWidth={2}
            />
          )}
        </button>

        {expanded && hasDetails && (
          <div className="space-y-2 border-t border-white/[0.06] pt-2 text-xs text-white/45">
            {messagePct !== null && (
              <div className="flex justify-between">
                <span>Messages</span>
                <span className="tabular-nums text-white/70">
                  {usage.messages_used} / {usage.limit}
                </span>
              </div>
            )}
            {tokenPct !== null && (
              <div className="flex justify-between gap-3">
                <span>Token estimate</span>
                <span className="tabular-nums text-white/70 text-right">
                  {(usage.tokens_used ?? 0).toLocaleString()} /{" "}
                  {(usage.token_cap ?? 0).toLocaleString()}
                  <span className="text-white/40"> ({tokenPct}%)</span>
                </span>
              </div>
            )}
            {tokenPct !== null && totalPct !== tokenPct && (
              <p className="text-white/35 text-[10px] leading-relaxed">
                Total {totalPct}% is based on estimated cost; token % can differ when replies are long or tools run extra steps.
              </p>
            )}
            <p className="text-white/30 pt-1 leading-relaxed">
              Resets on the 1st of each month.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
