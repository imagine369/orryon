"use client";

import { MessageSquare, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { AiAllowanceMeter } from "@/components/ai-allowance-meter";
import type { ChatUsage } from "@/lib/use-chat-usage";

interface PlanUsageSectionProps {
  plan: string;
  chatUsage: ChatUsage | null;
}

/**
 * Plan & Usage — single monthly pool that keeps Orryon working (chat, tools, voice replies).
 */
export function PlanUsageSection({ plan, chatUsage }: PlanUsageSectionProps) {
  const showChat =
    chatUsage !== null && (chatUsage.spend_cap_usd ?? 0) > 0;

  if (!showChat || !chatUsage) return null;

  const chatPaused = Boolean(chatUsage.at_limit);
  const chatLow = Boolean(chatUsage.near_limit) && !chatPaused;

  return (
    <div className="px-3 py-4 border-b border-white/5 space-y-4">
      <div>
        <p className="text-sm font-medium text-white/85">What keeps Orryon working</p>
        <p className="text-[11px] text-white/35 mt-1.5 leading-relaxed">
          One pool for typed chat, voice messages (after transcription), replies, search, and tools.
          {chatUsage.is_trial_period
            ? "On a free trial, usage follows your trial end date until you subscribe."
            : "Resets on your billing date (from Stripe), not the 1st of the calendar month."}
        </p>
      </div>

      <div
        className={cn(
          "rounded-xl border p-3 space-y-2",
          chatPaused
            ? "border-amber-500/25 bg-amber-500/[0.06]"
            : "border-white/[0.08] bg-white/[0.02]",
        )}
      >
        <div className="flex items-start gap-2.5">
          <MessageSquare
            className={cn(
              "h-4 w-4 shrink-0 mt-0.5",
              chatPaused ? "text-amber-400/90" : "text-emerald-400/80",
            )}
            strokeWidth={1.5}
          />
          <div className="min-w-0">
            <p className="text-sm text-white/80">Included usage</p>
            <p className="text-[11px] text-white/35 mt-0.5 leading-relaxed">
              Everything in chat counts here — including when you use the mic.
            </p>
          </div>
        </div>
        <AiAllowanceMeter usage={chatUsage} plan={plan} embedded />
        {chatPaused && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-2.5 py-2">
            <AlertCircle className="h-3.5 w-3.5 text-amber-400/90 shrink-0 mt-0.5" strokeWidth={1.5} />
            <p className="text-[11px] text-amber-200/85 leading-relaxed">
              Orryon is paused until this resets or you upgrade.
            </p>
          </div>
        )}
        {chatLow && !chatPaused && (
          <p className="text-[11px] text-amber-200/70 leading-relaxed">
            Running low — upgrade for more included usage this month.
          </p>
        )}
      </div>
    </div>
  );
}
