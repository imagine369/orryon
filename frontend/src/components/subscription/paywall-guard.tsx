"use client";

/**
 * PaywallGuard
 *
 * Wraps a money-management screen, tab, or panel and gates it behind an
 * active subscription. Use this ONLY on paid features — never on
 * breathing, meditation, or any wellbeing surface, which must remain
 * 100% free per product philosophy.
 *
 * Behaviour:
 *   - `loading` → render a small spinner (no flicker between auth states)
 *   - `is_active_pro` true (trial or pro) → render children unchanged
 *   - otherwise → render a soft preview behind a glass lock card
 *     containing a paywall trigger.
 *
 * Usage:
 *   <PaywallGuard feature="forecast">
 *     <ForecastTab />
 *   </PaywallGuard>
 *
 *   <PaywallGuard
 *     feature="goals"
 *     title="Goals are part of Pro"
 *     description="Track savings, milestones, and progress without the noise."
 *   >
 *     <GoalsTab />
 *   </PaywallGuard>
 */

import { ReactNode } from "react";
import { Lock, Sparkles, Wind } from "lucide-react";
import { useSubscription } from "@/lib/use-subscription";

interface PaywallGuardProps {
  /**
   * Short identifier for the gated feature. Forwarded to `showPaywall`
   * for analytics / instrumentation.
   */
  feature: string;
  /** Headline shown on the lock card. */
  title?: string;
  /** Body copy on the lock card. */
  description?: string;
  /** CTA label — defaults to "Unlock financial peace". */
  ctaLabel?: string;
  /**
   * The actual money-management UI. Rendered unchanged for Pro users,
   * shown behind a blur as a soft preview for free users.
   */
  children: ReactNode;
  /**
   * If true, free users see a fully blurred preview of the screen
   * behind the lock card. Defaults to true.
   */
  showPreview?: boolean;
  className?: string;
}

export function PaywallGuard({
  feature,
  title = "Pro feature",
  description = "Money management is part of Pro. Breathing & meditation will always stay free.",
  ctaLabel = "Unlock financial peace",
  children,
  showPreview = true,
  className = "",
}: PaywallGuardProps) {
  const { sub, loading } = useSubscription();

  if (loading) {
    return (
      <div className={"flex items-center justify-center py-12 " + className}>
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/15 border-t-white/55" />
      </div>
    );
  }

  if (sub?.is_active_pro) {
    return <>{children}</>;
  }

  return (
    <div className={"relative " + className}>
      {showPreview && (
        <div
          aria-hidden
          className="pointer-events-none select-none opacity-30 blur-[2px]"
        >
          {children}
        </div>
      )}

      {/* Lock card */}
      <div
        className={
          (showPreview
            ? "absolute inset-0 flex items-center justify-center p-4"
            : "flex items-center justify-center p-4")
        }
      >
        <div
          className="w-full max-w-md rounded-2xl border px-5 py-6 text-center"
          style={{
            background:
              "linear-gradient(180deg, rgba(13,37,53,0.92) 0%, rgba(17,46,64,0.92) 50%, rgba(12,34,51,0.92) 100%)",
            borderColor: "rgba(255,255,255,0.08)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
          }}
        >
          <div
            className="mx-auto mb-4 flex items-center justify-center rounded-full"
            style={{
              width: 44,
              height: 44,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.10)",
            }}
          >
            <Lock className="h-4 w-4 text-white/65" strokeWidth={1.5} />
          </div>

          <p
            className="font-[family-name:var(--font-playfair)]"
            style={{
              fontSize: "1.15rem",
              fontWeight: 600,
              color: "rgba(255,255,255,.90)",
              marginBottom: "0.5rem",
            }}
          >
            {title}
          </p>
          <p
            style={{
              fontSize: "0.84rem",
              lineHeight: 1.55,
              color: "rgba(255,255,255,.55)",
              marginBottom: "1.1rem",
            }}
          >
            {description}
          </p>

          {/* Free-forever reassurance */}
          <div
            className="mx-auto flex items-center justify-center gap-1.5 mb-4"
            style={{
              fontSize: "0.65rem",
              textTransform: "uppercase",
              letterSpacing: "2px",
              color: "rgba(255,255,255,0.32)",
            }}
          >
            <Wind className="h-3 w-3" strokeWidth={1.5} />
            Breathing stays free. Forever.
          </div>

          <a
            href="/login?step=tiers"
            className="group inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-[0.72rem] font-semibold uppercase tracking-[2.5px] text-white bg-white/[0.10] hover:bg-white/[0.18] border border-white/15 hover:border-white/25 transition-all"
          >
            <Sparkles
              className="h-3.5 w-3.5 text-white/80 group-hover:text-white"
              strokeWidth={1.8}
            />
            {ctaLabel}
          </a>
        </div>
      </div>
    </div>
  );
}
