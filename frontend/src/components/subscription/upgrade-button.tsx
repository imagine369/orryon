"use client";

/**
 * UpgradeButton & UpgradeBanner
 *
 * Reusable UI primitives that route through the global SubscriptionService
 * paywall. Use these anywhere a money-feature prompts an upgrade — never
 * gate Breathing behind them. Breathing is free, forever, by design.
 *
 *   <UpgradeButton variant="pill" reason="forecast-tab">
 *     Unlock financial peace
 *   </UpgradeButton>
 *
 *   <UpgradeBanner
 *     title="Track your money mindfully"
 *     reason="dashboard-locked"
 *   />
 */

import { ReactNode } from "react";
import { Sparkles, Wind } from "lucide-react";
import { useSubscriptionService } from "@/lib/subscription-service";
import { useSubscription } from "@/lib/use-subscription";

type UpgradeButtonVariant = "pill" | "subtle" | "icon";

interface UpgradeButtonProps {
  children?: ReactNode;
  variant?: UpgradeButtonVariant;
  reason?: string;
  className?: string;
  /** When true, renders even for active Pro subscribers (rare). */
  alwaysRender?: boolean;
  /** Optional aria-label override. */
  ariaLabel?: string;
}

/**
 * Universal "Upgrade" trigger. Hidden automatically for users on the Pro
 * plan unless `alwaysRender` is set. Falls back to rendering during
 * subscription-loading so we never flash a missing CTA.
 */
export function UpgradeButton({
  children,
  variant = "pill",
  reason,
  className = "",
  alwaysRender = false,
  ariaLabel,
}: UpgradeButtonProps) {
  const { showPaywall } = useSubscriptionService();
  const { sub } = useSubscription();

  const isPro = sub?.is_active_pro === true;
  if (!alwaysRender && isPro) return null;

  const handle = () => showPaywall(reason);
  const label = children ?? "Upgrade";

  if (variant === "icon") {
    return (
      <button
        onClick={handle}
        aria-label={ariaLabel ?? "Upgrade"}
        title="Upgrade"
        className={
          "inline-flex items-center justify-center rounded-full px-3 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[2px] " +
          "text-white/80 bg-white/10 hover:bg-white/15 hover:text-white border border-white/15 " +
          "transition-colors duration-200 " +
          className
        }
      >
        <Sparkles className="h-3 w-3 mr-1.5" strokeWidth={1.8} />
        {label}
      </button>
    );
  }

  if (variant === "subtle") {
    return (
      <button
        onClick={handle}
        aria-label={ariaLabel}
        className={
          "inline-flex items-center gap-1.5 text-xs text-white/55 hover:text-white " +
          "underline underline-offset-4 decoration-white/25 hover:decoration-white " +
          "transition-colors " +
          className
        }
      >
        {label}
      </button>
    );
  }

  // Default "pill" — soft luminous chip that fits dark surfaces.
  return (
    <button
      onClick={handle}
      aria-label={ariaLabel}
      className={
        "group relative inline-flex items-center gap-1.5 rounded-full px-4 py-2 " +
        "text-[0.72rem] font-semibold uppercase tracking-[2.5px] " +
        "text-white bg-white/[0.08] hover:bg-white/[0.14] " +
        "border border-white/15 hover:border-white/25 " +
        "transition-all duration-200 " +
        className
      }
    >
      <Sparkles className="h-3.5 w-3.5 text-white/75 group-hover:text-white" strokeWidth={1.8} />
      {label}
    </button>
  );
}

interface UpgradeBannerProps {
  /** Headline shown in the banner. Defaults to a warm, on-philosophy line. */
  title?: string;
  /** Body copy. Defaults reinforce the free-breathing message. */
  description?: string;
  /** Tag passed through to showPaywall for analytics. */
  reason?: string;
  /** CTA label — defaults to "Unlock financial peace". */
  ctaLabel?: string;
  className?: string;
}

/**
 * Soft banner suitable for placing above locked money sections (Forecast,
 * Budget, Goals, etc). Always reaffirms that breathing is free, so the
 * user never feels the paywall is asking for *all* their tools — just the
 * money-management ones.
 */
export function UpgradeBanner({
  title = "Bring the same peace to your finances.",
  description = "Money management is part of Pro. Breathing & meditation will always be free.",
  reason = "upgrade-banner",
  ctaLabel = "Unlock financial peace",
  className = "",
}: UpgradeBannerProps) {
  const { showPaywall } = useSubscriptionService();
  const { sub } = useSubscription();
  const isPro = sub?.is_active_pro === true;
  if (isPro) return null;

  return (
    <div
      className={
        "relative overflow-hidden rounded-2xl border px-5 py-4 flex items-center gap-4 " +
        className
      }
      style={{
        background:
          "linear-gradient(135deg, rgba(28,68,90,0.45) 0%, rgba(20,46,62,0.45) 100%)",
        borderColor: "rgba(255,255,255,0.08)",
      }}
    >
      <div
        className="shrink-0 flex items-center justify-center rounded-full"
        style={{
          width: 38,
          height: 38,
          background:
            "radial-gradient(circle at 50% 28%, #e0a8c8 0%, #cca0d8 16%, #a890d0 32%, #90a0d8 48%, #68b8d8 62%, #3ecfbe 76%, #1ab8a0 92%, #14b098 100%)",
          opacity: 0.85,
        }}
        aria-hidden
      >
        <Wind className="w-4 h-4 text-white/85" strokeWidth={1.5} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white/85 leading-snug truncate">
          {title}
        </p>
        <p className="text-[0.72rem] text-white/50 leading-snug mt-0.5">
          {description}
        </p>
      </div>

      <button
        onClick={() => showPaywall(reason)}
        className="shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[2px] text-white bg-white/[0.10] hover:bg-white/[0.18] border border-white/15 hover:border-white/25 transition-all"
      >
        <Sparkles className="h-3 w-3" strokeWidth={1.8} />
        {ctaLabel}
      </button>
    </div>
  );
}
