"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Subscription } from "@/lib/use-subscription";
import { api } from "@/lib/api";

interface Props {
  sub: Subscription;
}

export function TrialBanner({ sub }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  if (sub.plan === "pro" || dismissed) return null;

  const isExpired = sub.plan === "free";
  const daysLeft  = sub.trial_days_remaining;

  const message = isExpired
    ? "Your Pro trial has ended. Subscribe to continue."
    : daysLeft <= 1
    ? "Last day of your free trial. Your card will be charged tomorrow."
    : `${daysLeft} days left in your free trial.`;

  const urgency = isExpired || daysLeft <= 3;

  const handleManageBilling = async () => {
    setPortalLoading(true);
    try {
      const res = await api.post<{ portal_url: string }>("/api/subscription/portal");
      window.location.href = res.portal_url;
    } catch {
      setPortalLoading(false);
    }
  };

  return (
    <div
      className="flex items-center justify-between px-4 py-2 text-xs"
      style={{
        background: urgency ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <span className="text-white/50 flex-1">{message}</span>

      {isExpired ? (
        <a
          href="/login"
          className="ml-3 shrink-0 text-white font-semibold underline underline-offset-2 hover:text-white/80 transition-colors"
        >
          Subscribe
        </a>
      ) : (
        <button
          onClick={handleManageBilling}
          disabled={portalLoading}
          className="ml-3 shrink-0 text-white/50 hover:text-white/80 transition-colors disabled:opacity-40"
        >
          {portalLoading ? "Opening…" : "Manage billing"}
        </button>
      )}

      {!isExpired && !urgency && (
        <button
          onClick={() => setDismissed(true)}
          className="ml-2 shrink-0 text-white/30 hover:text-white/60 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      )}
    </div>
  );
}
