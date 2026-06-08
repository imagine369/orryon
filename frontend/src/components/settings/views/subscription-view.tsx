"use client";

import type { SettingsPanel } from "../panel-types";
import { PlanUsageCards } from "@/components/plan-usage-cards";
import { PlanUsageSection } from "@/components/plan-usage-section";
import { openBillingPortal } from "../billing-helpers";

export function SubscriptionView({ panel }: { panel: SettingsPanel }) {
  const { sub, chatUsage, billingLoading, setBillingLoading } = panel;

  if (!sub) return null;

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl divide-y divide-white/5">
      <PlanUsageCards
        sub={sub}
        usageResetsLabel={chatUsage?.usage_resets_label ?? sub.usage_resets_label}
        manageLoading={billingLoading}
        onManageBilling={() => openBillingPortal(setBillingLoading)}
      />
      {sub.is_active_pro && (
        <PlanUsageSection plan={sub.plan} chatUsage={chatUsage} />
      )}
      {chatUsage &&
        (chatUsage.at_limit || chatUsage.near_limit) &&
        chatUsage.upgrade_plan && (
        <div className="px-3 pb-3 border-b border-white/5">
          <p className="text-xs text-amber-200/80">
            {chatUsage.at_limit
              ? "Chat limit reached — upgrade for more included usage."
              : "Chat allowance running low — upgrade for a higher limit."}
          </p>
        </div>
      )}
    </div>
  );
}
