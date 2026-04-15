"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check } from "lucide-react";
import { api } from "@/lib/api";

const MONTHLY_PRICE_ID = process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY ?? "";
const ANNUAL_PRICE_ID  = process.env.NEXT_PUBLIC_STRIPE_PRICE_ANNUAL  ?? "";

const PRO_FEATURES = [
  "Full access to your personal concierge",
  "Easy voice input",
  "Search across transactions, notes & tasks",
  "Budget tracking with custom categories",
  "Spending summaries, recaps & patterns",
  "Savings & financial goals",
  "Recurring bills & income tracking",
  "Cash flow forecast",
  "Calendar events, reminders & errands",
  "Today — tasks & events at a glance",
  "Lists — groceries, errands & more",
  "Journal — private daily entries",
  "Guided breathing & mindfulness",
  "Full data export",
  "Bill due & event reminder alerts",
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function UpgradeModal({ open, onClose }: Props) {
  const [selected, setSelected] = useState<"monthly" | "annual">("monthly");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleUpgrade = async () => {
    const priceId = selected === "monthly" ? MONTHLY_PRICE_ID : ANNUAL_PRICE_ID;
    if (!priceId) {
      setError("Billing not configured yet. Check back soon.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const origin = window.location.origin;
      const res = await api.post<{ checkout_url: string }>("/api/subscription/checkout", {
        price_id: priceId,
        success_url: `${origin}/home?upgraded=1`,
        cancel_url: `${origin}/home`,
      });
      window.location.href = res.checkout_url;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 32, mass: 0.9 }}
            className="fixed bottom-0 left-0 right-0 z-[70] flex flex-col max-h-[92vh] rounded-t-3xl bg-[#141414] border-t border-white/8 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0">
              <div>
                <p className="text-[0.6rem] uppercase tracking-[4px] text-white/40 mb-0.5">Upgrade</p>
                <h2 className="text-xl font-bold text-white font-[family-name:var(--font-playfair)]">
                  Go Pro
                </h2>
              </div>
              <button onClick={onClose} className="text-white/40 hover:text-white transition p-1">
                <X className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-5 pb-6">
              {/* Billing toggle */}
              <div className="flex rounded-full border border-white/8 bg-black p-0.5 mb-5">
                {(["monthly", "annual"] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setSelected(opt)}
                    className="flex-1 rounded-full px-4 py-2 text-xs font-medium transition-all duration-200 flex items-center justify-center gap-2 whitespace-nowrap"
                    style={{
                      background: selected === opt ? "rgba(255,255,255,0.1)" : "transparent",
                      color: selected === opt ? "white" : "rgba(255,255,255,0.35)",
                    }}
                  >
                    {opt === "monthly" ? (
                      <>Monthly <span className="text-white/40">$8 / mo</span></>
                    ) : (
                      <>Annual <span className="text-white/40">$6 / mo</span><span className="text-white/25 mx-1">·</span><span className="text-white/40">$72 / yr</span>
                        <span className="text-[0.55rem] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-white/10 text-white/60">Save 25%</span>
                      </>
                    )}
                  </button>
                ))}
              </div>

              {/* Feature list */}
              <div className="rounded-2xl border border-white/8 bg-black p-4 mb-5">
                <p className="text-[0.6rem] uppercase tracking-[3px] text-white/30 mb-3">Everything in Pro</p>
                <ul className="space-y-2">
                  {PRO_FEATURES.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-white/70">
                      <Check className="h-3.5 w-3.5 text-white/30 shrink-0 mt-0.5" strokeWidth={2} />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>

              {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

              {/* CTA */}
              <button
                onClick={handleUpgrade}
                disabled={loading}
                className="w-full rounded-full bg-white text-black text-sm font-semibold uppercase tracking-[3px] py-3.5 transition-opacity disabled:opacity-50"
              >
                {loading ? "Redirecting…" : selected === "monthly" ? "Get Pro — $8 / mo" : "Get Pro — $72 / yr"}
              </button>
              <p className="text-center text-xs text-white/25 mt-3">
                Cancel anytime · Powered by Stripe
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
