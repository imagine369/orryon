"use client";

import { ExternalLink } from "lucide-react";
import {
  FULFILLMENT_TYPE_ICONS,
  type FulfillmentHandoff,
} from "@/lib/fulfillment-types";

interface FulfillmentCardProps {
  handoff: FulfillmentHandoff;
  compact?: boolean;
}

/**
 * Renders a partner deeplink handoff. Opens external app in a new tab;
 * Orryon never completes checkout on the user's behalf.
 */
export function FulfillmentCard({ handoff, compact = false }: FulfillmentCardProps) {
  const icon = FULFILLMENT_TYPE_ICONS[handoff.type] ?? "✦";

  return (
    <div
      className={
        compact
          ? "rounded-xl border border-white/[0.08] bg-white/[0.03] p-3"
          : "rounded-xl border border-white/[0.1] bg-white/[0.04] p-4"
      }
    >
      <div className="flex items-start gap-3">
        <span className="text-lg leading-none mt-0.5" aria-hidden>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white/85 truncate">{handoff.title}</p>
          {handoff.subtitle ? (
            <p className="text-xs text-white/40 mt-0.5 line-clamp-2">{handoff.subtitle}</p>
          ) : null}
        </div>
      </div>
      <a
        href={handoff.action_url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.06] py-2.5 text-xs font-semibold text-white/80 transition hover:bg-white/[0.1] hover:text-white"
      >
        {handoff.action_label || "Open"}
        <ExternalLink className="h-3 w-3 opacity-60" strokeWidth={1.5} />
      </a>
      <p className="mt-2 text-[10px] text-white/25 text-center leading-snug">
        Opens in partner app · you confirm &amp; pay there
      </p>
    </div>
  );
}

interface FulfillmentCardListProps {
  handoffs: FulfillmentHandoff[];
  compact?: boolean;
  onDismiss?: (id: string) => void;
}

export function FulfillmentCardList({ handoffs, compact, onDismiss }: FulfillmentCardListProps) {
  if (!handoffs.length) return null;
  return (
    <div className="mt-3 flex flex-col gap-2.5">
      {handoffs.map((h) => (
        <div key={h.id} className={onDismiss ? "relative" : undefined}>
          <FulfillmentCard handoff={h} compact={compact} />
          {onDismiss ? (
            <button
              type="button"
              onClick={() => onDismiss(h.id)}
              className="absolute top-2 right-2 text-[10px] text-white/25 hover:text-white/50 px-2 py-1 rounded-md transition"
            >
              Dismiss
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
