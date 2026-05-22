"use client";

/**
 * Paywall overlay
 *
 * Shown via `SubscriptionService.showPaywall()`. Headline is intentionally
 * NOT "Upgrade" or "Go Pro" — it's "Unlock Financial Peace", framing the
 * paid features as continuing the same wellbeing arc that Breathing started.
 *
 * The belief that breathing & meditation should always be free is stated
 * up-front and reinforced in the secondary line. Keep it warm — never
 * preachy or smug — when editing this file.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, Wind } from "lucide-react";
import { PillButton } from "@/components/pill-cta";
import type { CheckoutPlan } from "@/lib/subscription-service";

/**
 * SSR-safe "are we running in the browser?" check. Avoids the
 * setState-in-useEffect pattern that React 19's lint rules flag.
 * Used to gate `createPortal(document.body)` until hydration completes.
 */
const IS_BROWSER = typeof document !== "undefined";

const BG = "linear-gradient(180deg, #0d2535 0%, #112e40 45%, #0c2233 100%)";
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const PAID_FEATURES = [
  "Budget tracking with custom categories",
  "Spending summaries, recaps & patterns",
  "Savings & financial goals",
  "Recurring bills & income tracking",
  "Cash flow forecast",
  "Search across transactions, notes & tasks",
  "Calendar events, reminders & errands",
  "Full data export",
];

interface PaywallProps {
  open: boolean;
  reason?: string;
  onClose: () => void;
  onCheckout: (plan: CheckoutPlan) => Promise<void> | void;
  checkoutPending: boolean;
  checkoutError?: string | null;
}

export function Paywall({ open, onClose, onCheckout, checkoutPending, checkoutError }: PaywallProps) {
  const [plan, setPlan] = useState<CheckoutPlan>("monthly");

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!IS_BROWSER) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="paywall-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28 }}
          className="fixed inset-0 z-[10000] flex flex-col select-none overflow-y-auto"
          style={{ background: BG, fontFamily: FONT }}
        >
          {/* Close */}
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-5 z-10 flex items-center justify-center w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
            style={{ top: "max(1.1rem, env(safe-area-inset-top, 1.1rem))" }}
          >
            <X className="h-4 w-4 text-white/60" strokeWidth={1.5} />
          </button>

          {/* Ambient glow — same family as the breathing orb */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 -translate-x-1/2"
            style={{
              top: "12%",
              width: "92vw",
              height: "92vw",
              maxWidth: 520,
              maxHeight: 520,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, hsla(200,42%,60%,.16) 0%, transparent 70%)",
              filter: "blur(2px)",
            }}
          />

          <div
            className="relative flex flex-col items-center px-5 w-full"
            style={{
              paddingTop: "max(4.5rem, calc(env(safe-area-inset-top, 0px) + 3.5rem))",
              paddingBottom: "max(2rem, calc(env(safe-area-inset-bottom, 0px) + 1.5rem))",
            }}
          >
            {/* Small eyebrow */}
            <p
              className="mb-3"
              style={{
                fontSize: "0.6rem",
                textTransform: "uppercase",
                letterSpacing: "3px",
                color: "rgba(255,255,255,.40)",
              }}
            >
              Money Management
            </p>

            {/* Headline */}
            <h1
              className="text-center font-[family-name:var(--font-playfair)]"
              style={{
                fontSize: "clamp(1.7rem, 6vw, 2.4rem)",
                fontWeight: 700,
                color: "rgba(255,255,255,.92)",
                lineHeight: 1.15,
                marginBottom: "0.85rem",
                maxWidth: 520,
              }}
            >
              Unlock Financial Peace
            </h1>

            {/* Subtext — the belief */}
            <p
              className="text-center"
              style={{
                fontSize: "0.92rem",
                lineHeight: 1.6,
                color: "rgba(255,255,255,.62)",
                maxWidth: 460,
                marginBottom: "2rem",
              }}
            >
              Breathing and meditation will always stay free for all humans.
              Upgrade now to add powerful money management tools.
            </p>

            {/* The free-forever reassurance card */}
            <div
              className="flex items-start gap-3 rounded-2xl border px-4 py-3 mb-6"
              style={{
                background: "rgba(255,255,255,0.04)",
                borderColor: "rgba(255,255,255,0.08)",
                maxWidth: 460,
                width: "100%",
              }}
            >
              <div
                className="shrink-0 flex items-center justify-center rounded-full"
                style={{
                  width: 32,
                  height: 32,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.10)",
                }}
              >
                <Wind className="w-3.5 h-3.5 text-white/55" strokeWidth={1.5} />
              </div>
              <div>
                <p className="text-[0.78rem] font-semibold text-white/75 mb-0.5">
                  Breathing stays free. Forever.
                </p>
                <p className="text-[0.72rem] text-white/45 leading-snug">
                  We believe tools that support breathing, meditation, and
                  human wellbeing should be available to everyone — no account
                  tier required.
                </p>
              </div>
            </div>

            {/* Plan toggle */}
            <div
              className="flex rounded-full p-0.5 mb-4 w-full"
              style={{
                maxWidth: 460,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              {(["monthly", "annual"] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setPlan(opt)}
                  className="flex-1 rounded-full px-3 py-2.5 text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 whitespace-nowrap"
                  style={{
                    background:
                      plan === opt ? "rgba(255,255,255,0.10)" : "transparent",
                    color: plan === opt ? "white" : "rgba(255,255,255,0.42)",
                  }}
                >
                  {opt === "monthly" ? (
                    <>
                      Monthly <span className="text-white/40">$22/mo</span>
                    </>
                  ) : (
                    <>
                      Annual <span className="text-white/40">$16.50/mo</span>
                      <span className="text-white/25 mx-1">·</span>
                      <span className="text-white/40">$198/yr</span>
                      <span
                        className="text-[0.55rem] uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                        style={{
                          background: "rgba(255,255,255,0.10)",
                          color: "rgba(255,255,255,0.65)",
                        }}
                      >
                        Save 25%
                      </span>
                    </>
                  )}
                </button>
              ))}
            </div>

            {/* Feature list */}
            <div
              className="rounded-2xl p-5 mb-6 w-full"
              style={{
                maxWidth: 460,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <p
                className="mb-3"
                style={{
                  fontSize: "0.6rem",
                  textTransform: "uppercase",
                  letterSpacing: "3px",
                  color: "rgba(255,255,255,0.30)",
                }}
              >
                What you unlock
              </p>
              <ul className="space-y-2">
                {PAID_FEATURES.map((f) => (
                  <li
                    key={f}
                    className="flex items-center gap-2.5 text-sm text-white/72"
                  >
                    <Check
                      className="h-3.5 w-3.5 text-white/40 shrink-0"
                      strokeWidth={2}
                    />
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            {/* CTA */}
            <div className="w-full flex flex-col items-center" style={{ maxWidth: 460 }}>
              <PillButton
                onClick={() => onCheckout(plan)}
                disabled={checkoutPending}
                className="w-full"
              >
                {checkoutPending
                  ? "Opening checkout…"
                  : plan === "annual"
                  ? "Start now · $198 / year"
                  : "Start 14-day free trial · $22 / month"}
              </PillButton>

              {plan === "monthly" && !checkoutPending && (
                <p
                  className="mt-2.5 text-center text-[0.72rem]"
                  style={{ color: "rgba(255,255,255,0.35)" }}
                >
                  Free for 14 days, then $22/mo. Cancel anytime.
                </p>
              )}
              {plan === "annual" && !checkoutPending && (
                <p
                  className="mt-2.5 text-center text-[0.72rem]"
                  style={{ color: "rgba(255,255,255,0.35)" }}
                >
                  Billed once at $198. Cancel anytime.
                </p>
              )}

              {checkoutError && (
                <p
                  className="mt-3 text-center text-[0.75rem] leading-snug"
                  style={{ color: "rgba(255, 120, 100, 0.90)", maxWidth: 380 }}
                >
                  {checkoutError}
                </p>
              )}

              <a
                href="/upgrade"
                className="mt-4 text-[0.72rem] uppercase tracking-[2px] text-white/45 hover:text-white/70 transition-colors underline underline-offset-2"
              >
                Compare Pro, Premium & Premium Plus
              </a>

              <button
                onClick={onClose}
                className="mt-3 text-[0.72rem] uppercase tracking-[3px] text-white/35 hover:text-white/65 transition-colors"
              >
                Maybe later — keep breathing for free
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
