"use client";

import type { Billing } from "@/lib/pricing-tiers";

function SaveBadge() {
  return (
    <span
      className="inline-block text-[0.55rem] uppercase tracking-wider px-1.5 py-0.5 rounded-full font-semibold"
      style={{ background: "rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.65)" }}
    >
      Save 25%
    </span>
  );
}

export function BillingPeriodToggle({
  billing,
  onChange,
  compact = false,
}: {
  billing: Billing;
  onChange: (b: Billing) => void;
  compact?: boolean;
}) {
  return (
    <div
      className="inline-flex w-full rounded-full p-0.5"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
      role="group"
      aria-label="Billing period"
    >
      {(["monthly", "annual"] as const).map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={
            compact
              ? "flex-1 rounded-full px-2 py-1.5 text-[10px] font-medium transition-all duration-200 flex items-center justify-center gap-1 min-h-[28px]"
              : "flex-1 rounded-full px-3 py-2 text-xs sm:text-sm font-medium transition-all duration-200 flex items-center justify-center gap-1.5 min-h-[36px]"
          }
          style={{
            background: billing === opt ? "rgba(255,255,255,0.10)" : "transparent",
            color: billing === opt ? "white" : "rgba(255,255,255,0.42)",
          }}
        >
          {opt === "monthly" ? "Monthly" : (
            <>
              Annual <SaveBadge />
            </>
          )}
        </button>
      ))}
    </div>
  );
}
