"use client";

import { useState } from "react";
import { X, RefreshCw } from "lucide-react";
import Link from "next/link";
import { UPGRADE_PATH } from "@/lib/pricing-tiers";
import { api } from "@/lib/api";
import { Subscription } from "@/lib/use-subscription";

interface Props {
  sub: Subscription;
  onSubscriptionUpdated?: () => void;
}

export function TrialBanner({ sub, onSubscriptionUpdated }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);

  if (
    sub.has_stripe_subscription ||
    sub.plan === "pro" ||
    sub.plan === "premium" ||
    sub.plan === "premium_plus" ||
    dismissed
  ) {
    return null;
  }

  const isExpired = sub.plan === "free" || sub.plan === "past_due";
  const daysLeft = sub.trial_days_remaining;

  const message =
    sub.plan === "past_due"
      ? "Your payment failed. Please update your billing details."
      : isExpired
        ? "Your trial has ended — but if you already paid, restore your plan below."
        : daysLeft <= 1
          ? "Last day of your free trial."
          : `${daysLeft} days left in your free trial.`;

  const urgency = isExpired || daysLeft <= 3;

  const handleRestore = async () => {
    setRestoring(true);
    setRestoreMsg(null);
    try {
      const res = await api.post<Subscription & { sync_message?: string; synced?: boolean }>(
        "/api/subscription/sync",
      );
      onSubscriptionUpdated?.();
      if (res.plan === "premium" || res.plan === "premium_plus" || res.plan === "pro") {
        setRestoreMsg(res.sync_message || `You're on ${res.plan}.`);
        return;
      }
      setRestoreMsg(
        res.sync_message ||
          "Stripe has no active subscription for this login email. Try the email you used at checkout, or contact support@orryon.com.",
      );
    } catch (e: unknown) {
      setRestoreMsg(e instanceof Error ? e.message : "Could not restore plan. Try again.");
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div
      className="flex flex-col px-4 py-2 text-xs gap-2"
      style={{
        background: urgency ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-white/50 flex-1 leading-snug">{message}</span>

        {!isExpired && (
          <button
            onClick={() => setDismissed(true)}
            className="shrink-0 text-white/30 hover:text-white/60 transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        )}
      </div>

      {isExpired && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleRestore()}
            disabled={restoring}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white bg-white/10 hover:bg-white/15 border border-white/15 transition disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${restoring ? "animate-spin" : ""}`} strokeWidth={2} />
            {restoring ? "Checking Stripe…" : "Restore my paid plan"}
          </button>
          <Link
            href={UPGRADE_PATH}
            className="text-white/45 hover:text-white/70 underline underline-offset-2"
          >
            View plans
          </Link>
        </div>
      )}

      {restoreMsg && (
        <p className="text-white/55 text-[0.7rem] leading-snug">{restoreMsg}</p>
      )}

      {!isExpired && sub.plan === "trial" && (
        <p className="text-white/40 text-[0.65rem] leading-snug">
          Try the mic — speak in, read text replies. Premium Plus adds spoken replies.
        </p>
      )}

      {!isExpired && (
        <Link
          href={UPGRADE_PATH}
          className="text-white/45 hover:text-white/70 underline underline-offset-2 w-fit"
        >
          Upgrade anytime
        </Link>
      )}
    </div>
  );
}
