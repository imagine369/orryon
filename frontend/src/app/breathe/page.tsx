"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Play, ChevronRight, Square, Wind, Anchor, Crosshair, Sun, Moon, Pause, Zap, Waves, Check, type LucideProps } from "lucide-react";
import { useResetAnchors } from "@/lib/use-reset-anchors";
import { RESET_ANCHORS, getRecommendedAnchor, type ResetAnchor } from "@/lib/reset-scripts";
import { ResetAnchorSession } from "@/components/reset-anchor-session";
import { primeAudioContext } from "@/lib/breathing-sounds";
import { FreeSettingsSheet } from "@/components/free-settings-sheet";
import type { MoodState } from "@/lib/use-reset-anchors";

// ── Free-tier nav ──────────────────────────────────────────────────────────────

function FreeTierNav({ onUpgrade, onSettings, checkoutPending }: {
  onUpgrade: () => void;
  onSettings: () => void;
  checkoutPending: boolean;
}) {
  const { user } = useAuth();

  if (!user) return null;

  const initials = (user.display_name || user.email || "?")
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div style={{
      position: "sticky",
      top: 0,
      zIndex: 30,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "14px 20px",
      paddingTop: "max(14px, calc(14px + env(safe-area-inset-top)))",
      paddingLeft: "max(20px, calc(20px + env(safe-area-inset-left)))",
      paddingRight: "max(20px, calc(20px + env(safe-area-inset-right)))",
      background: "rgba(0,0,0,0.85)",
      backdropFilter: "blur(16px)",
      WebkitBackdropFilter: "blur(16px)",
      borderBottom: "1px solid rgba(255,255,255,0.05)",
    }}>
      {/* Wordmark */}
      <span style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.85)", letterSpacing: "-0.02em" }}>
        orryon
      </span>

      {/* Right side */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* Upgrade pill */}
        <button
          onClick={onUpgrade}
          disabled={checkoutPending}
          style={{
            padding: "6px 14px",
            borderRadius: 20,
            background: "rgba(255,255,255,0.9)",
            color: "#000",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.03em",
            border: "none",
            cursor: "pointer",
            opacity: checkoutPending ? 0.6 : 1,
          }}
        >
          {checkoutPending ? "Opening…" : "Upgrade"}
        </button>

        {/* Avatar → opens settings sheet */}
        <button
          onClick={onSettings}
          style={{
            width: 44, height: 44, borderRadius: "50%",
            background: "rgba(255,255,255,0.1)",
            border: "1px solid rgba(255,255,255,0.12)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)",
            cursor: "pointer",
          }}
          aria-label="Account settings"
        >
          {initials}
        </button>
      </div>
    </div>
  );
}

// ── Per-anchor icon ────────────────────────────────────────────────────────────

type IconComponent = React.ComponentType<LucideProps>;

const ANCHOR_ICON: Record<string, IconComponent> = {
  "quick-box-reset":         Square,
  "clarity-breath-2min":     Wind,
  "double-inhale-destress":  Zap,
  "grounding-anchor-3min":   Anchor,
  "focus-return-4min":       Crosshair,
  "midday-reset-5min":       Sun,
  "evening-release-7min":    Moon,
  "sleep-descent":           Waves,
  "do-nothing":              Pause,
};

function AnchorIcon({ anchor, size = 32 }: { anchor: ResetAnchor; size?: number }) {
  const Icon = ANCHOR_ICON[anchor.id] ?? Wind;
  const pad = Math.round(size * 0.26);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flexShrink: 0,
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.04)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon size={size - pad * 2} strokeWidth={1.4} color="rgba(255,255,255,0.50)" />
    </div>
  );
}

// ── Streak ring ────────────────────────────────────────────────────────────────

function StreakRing({ count }: { count: number }) {
  const r = 10;
  const c = 2 * Math.PI * r;
  const segments = Math.min(count, 7);
  const fraction = segments / 7;
  const dash = c * fraction;
  const gap  = c - dash;
  return (
    <div style={{ position: "relative", width: 28, height: 28 }}>
      <svg width="28" height="28" viewBox="0 0 28 28" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="14" cy="14" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="1.5" />
        {count > 0 && (
          <circle cx="14" cy="14" r={r} fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5"
            strokeDasharray={`${dash} ${gap}`} strokeLinecap="round" />
        )}
      </svg>
      <span style={{
        position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 8, fontWeight: 700, lineHeight: 1,
        color: count > 0 ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.2)",
      }}>
        {count}
      </span>
    </div>
  );
}

// ── Recommended card ───────────────────────────────────────────────────────────

function RecommendedCard({ anchor, onStart }: { anchor: ResetAnchor; onStart: (a: ResetAnchor) => void }) {
  return (
    <div style={{
      borderRadius: 16,
      border: "1px solid rgba(255,255,255,0.09)",
      background: "rgba(255,255,255,0.04)",
      padding: "18px 18px 16px",
      marginBottom: 4,
    }}>
      <p style={{ fontSize: 9, color: "rgba(255,255,255,0.28)", letterSpacing: "0.13em", textTransform: "uppercase", marginBottom: 10, fontWeight: 600 }}>
        Recommended
      </p>
      <div style={{ marginBottom: 14 }}>
        <div style={{
          width: 36, height: 36, borderRadius: "50%", opacity: 0.72,
          background: "radial-gradient(circle at 50% 28%, #e0a8c8 0%, #cca0d8 16%, #a890d0 32%, #90a0d8 48%, #68b8d8 62%, #3ecfbe 76%, #1ab8a0 92%, #14b098 100%)",
        }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 17, fontWeight: 700, color: "rgba(255,255,255,0.9)", letterSpacing: "-0.02em", lineHeight: 1.25, marginBottom: 5 }}>
            {anchor.title}
          </p>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", lineHeight: 1.5, marginBottom: 14, maxWidth: 280 }}>
            {anchor.tagline}
          </p>
        </div>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", fontWeight: 600, marginLeft: 8, whiteSpace: "nowrap", marginTop: 2 }}>
          {anchor.displayDuration}
        </span>
      </div>
      <button
        onClick={() => onStart(anchor)}
        style={{
          display: "flex", alignItems: "center", gap: 8, padding: "10px 18px",
          borderRadius: 10, border: "none", background: "rgba(255,255,255,0.9)",
          color: "#000", fontSize: 12, fontWeight: 600, cursor: "pointer",
        }}
      >
        <Play size={11} strokeWidth={2} />
        Start now
      </button>
    </div>
  );
}

// ── Anchor row ─────────────────────────────────────────────────────────────────

function AnchorRow({ anchor, isRecommended, onStart }: { anchor: ResetAnchor; isRecommended: boolean; onStart: (a: ResetAnchor) => void }) {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div
      onClick={() => setShowInfo((v) => !v)}
      style={{ padding: "14px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "default" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <AnchorIcon anchor={anchor} size={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.85)", letterSpacing: "-0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {anchor.title}
            </p>
            {isRecommended && (
              <span style={{ fontSize: 8, color: "rgba(255,255,255,0.28)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, padding: "1px 5px", letterSpacing: "0.06em" }}>
                NOW
              </span>
            )}
          </div>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.32)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {anchor.tagline}
          </p>
        </div>
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", fontWeight: 600 }}>
            {anchor.displayDuration}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onStart(anchor); }}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 44, height: 44, borderRadius: "50%",
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.04)",
              color: "rgba(255,255,255,0.55)", cursor: "pointer",
            }}
          >
            <ChevronRight size={14} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showInfo && anchor.science && (
          <motion.div
            key="info"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.25, 0, 0, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ marginTop: 10, marginLeft: 46, padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.52)", lineHeight: 1.7 }}>
                {anchor.science}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Upgrade card ───────────────────────────────────────────────────────────────

type UpgradeTier = "starter" | "pro" | "premium";

const UPGRADE_TIERS: {
  id: UpgradeTier;
  name: string;
  monthlyPrice: number;
  annualMonthlyPrice: number;
  annualTotal: number;
  voiceMinutes: number;
  badge?: string;
  features: string[];
}[] = [
  {
    id: "starter",
    name: "Starter",
    monthlyPrice: 11,
    annualMonthlyPrice: 8.25,
    annualTotal: 99,
    voiceMinutes: 30,
    features: [
      "Personal AI concierge (text)",
      "Health, location & daily briefing",
      "Budget tracking & goals",
      "30 voice-input minutes/mo",
      "Full data export",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    monthlyPrice: 22,
    annualMonthlyPrice: 16.50,
    annualTotal: 198,
    voiceMinutes: 150,
    badge: "Most popular",
    features: [
      "Everything in Starter",
      "Voice responses (TTS)",
      "Long-term memory & proactive AI",
      "150 voice minutes/mo",
      "On-demand top-ups ($6/60 min)",
    ],
  },
  {
    id: "premium",
    name: "Premium",
    monthlyPrice: 33,
    annualMonthlyPrice: 24.75,
    annualTotal: 297,
    voiceMinutes: 350,
    features: [
      "Everything in Pro",
      "Unlimited messages",
      "350 voice minutes/mo",
      "Golden Mode & priority AI",
    ],
  },
];

const UPGRADE_PRICE_IDS: Record<UpgradeTier, Record<"monthly" | "annual", string>> = {
  starter: {
    monthly: process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER_MONTHLY ?? "",
    annual:  process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER_ANNUAL  ?? "",
  },
  pro: {
    monthly: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY ?? process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY ?? "",
    annual:  process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_ANNUAL  ?? process.env.NEXT_PUBLIC_STRIPE_PRICE_ANNUAL  ?? "",
  },
  premium: {
    monthly: process.env.NEXT_PUBLIC_STRIPE_PRICE_PREMIUM_MONTHLY ?? "",
    annual:  process.env.NEXT_PUBLIC_STRIPE_PRICE_PREMIUM_ANNUAL  ?? "",
  },
};

function UpgradeCard({
  startCheckout,
  checkoutPending,
}: {
  startCheckout: (priceId: string, tier: UpgradeTier, billing: "monthly" | "annual") => void;
  checkoutPending: string | null;
}) {
  const [billing, setBilling] = useState<"monthly" | "annual">("annual");
  const [tier, setTier] = useState<UpgradeTier>("pro");

  return (
    <div id="upgrade" className="mt-12 space-y-3">
      <p className="text-[0.6rem] uppercase tracking-[4px] text-white/40">Pricing</p>
      <h2 className="text-2xl font-bold text-white font-[family-name:var(--font-playfair)]">
        Unlock your personal operator.
      </h2>

      {/* Billing toggle */}
      <div className="flex rounded-full border border-white/8 bg-[#111] p-0.5">
        {(["monthly", "annual"] as const).map((opt) => (
          <button
            key={opt}
            onClick={() => setBilling(opt)}
            className="flex-1 rounded-full px-3 py-2.5 text-sm font-medium transition-all duration-200 flex items-center justify-center gap-1.5 min-h-[44px]"
            style={{
              background: billing === opt ? "rgba(255,255,255,0.1)" : "transparent",
              color: billing === opt ? "white" : "rgba(255,255,255,0.35)",
            }}
          >
            {opt === "monthly" ? "Monthly" : (
              <><span>Annual</span>
                <span className="text-[0.55rem] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">Save 25%</span>
              </>
            )}
          </button>
        ))}
      </div>

      {/* Tier cards */}
      <div className="space-y-2">
        {UPGRADE_TIERS.map((t) => {
          const isSelected = tier === t.id;
          const priceLabel = billing === "annual"
            ? `$${t.annualMonthlyPrice.toFixed(2)}/mo`
            : `$${t.monthlyPrice}/mo`;
          return (
            <button
              key={t.id}
              onClick={() => setTier(t.id)}
              className="w-full text-left rounded-2xl border transition-all duration-200 p-4"
              style={{
                borderColor: isSelected ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.07)",
                background: isSelected ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.02)",
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-semibold text-white/90">{t.name}</p>
                    {t.badge && (
                      <span className="text-[0.5rem] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-white/10 text-white/50">{t.badge}</span>
                    )}
                  </div>
                  <p className="text-xs text-white/35">{t.voiceMinutes} voice min/mo</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-base font-bold text-white">{priceLabel}</p>
                  {billing === "annual" && (
                    <p className="text-[0.6rem] text-white/30">${t.annualTotal}/yr</p>
                  )}
                </div>
              </div>
              {isSelected && (
                <ul className="mt-3 space-y-1.5 border-t border-white/[0.06] pt-3">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-white/55">
                      <Check className="h-3 w-3 text-white/35 shrink-0 mt-0.5" strokeWidth={2.5} />
                      {f}
                    </li>
                  ))}
                </ul>
              )}
            </button>
          );
        })}
      </div>

      {/* CTA */}
      <button
        onClick={() => {
          const priceId = UPGRADE_PRICE_IDS[tier][billing];
          startCheckout(priceId || `/login?step=tiers`, tier, billing);
        }}
        disabled={checkoutPending !== null}
        className="flex items-center justify-center w-full rounded-full bg-white py-3.5 text-[0.85rem] font-semibold text-black hover:bg-white/90 active:scale-[0.98] transition-all disabled:opacity-60"
      >
        {checkoutPending ? "Redirecting to payment…" : `UPGRADE TO ${UPGRADE_TIERS.find(t=>t.id===tier)?.name.toUpperCase()}`}
      </button>
      <p className="text-center text-xs text-white/25">
        Breathing stays free forever — even if you never upgrade.
      </p>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

const MONTHLY_PRICE_ID = process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY ?? "";
const ANNUAL_PRICE_ID  = process.env.NEXT_PUBLIC_STRIPE_PRICE_ANNUAL  ?? "";

export default function BreathePage() {
  const { lastUsedId, markedToday, streakCount, addCompletion, updateCompletion, markStreakForCompletion } = useResetAnchors();

  const [activeAnchor,    setActiveAnchor]    = useState<ResetAnchor | null>(null);

  const handleStartAnchor = useCallback((anchor: ResetAnchor) => {
    primeAudioContext();
    setActiveAnchor(anchor);
  }, []);
  const [checkoutPending, setCheckoutPending] = useState<string | null>(null);

  const startCheckout = useCallback(async (priceId: string, tier: UpgradeTier, billing: "monthly" | "annual") => {
    if (!priceId || priceId.startsWith("/")) {
      window.location.href = `/login?step=tiers`;
      return;
    }
    setCheckoutPending(priceId);
    try {
      const origin = window.location.origin;
      const res = await api.post<{ checkout_url: string }>("/api/subscription/checkout", {
        price_id: priceId,
        success_url: `${origin}/home?upgraded=1`,
        cancel_url:  `${origin}/breathe`,
      });
      window.location.href = res.checkout_url;
    } catch {
      setCheckoutPending(null);
    }
  }, []);

  const handleNavUpgrade = useCallback(() => {
    const priceId = MONTHLY_PRICE_ID || "";
    startCheckout(priceId || `/login?step=tiers`, "pro", "monthly");
  }, [startCheckout]);

  // Settings sheet
  const [settingsOpen, setSettingsOpen] = useState(false);

  const recommended = getRecommendedAnchor(lastUsedId);

  const handleAddCompletion = (anchorId: string, duration: number, preMood?: MoodState): string =>
    addCompletion({ anchorId, duration, preMood }).id;

  const handleUpdateCompletion = (id: string, postMood?: MoodState, note?: string) =>
    updateCompletion(id, { postMood, note });

  return (
    <div className="min-h-full bg-black text-white">

      {/* Nav — only visible to signed-in free users */}
      <FreeTierNav
        onUpgrade={handleNavUpgrade}
        onSettings={() => setSettingsOpen(true)}
        checkoutPending={checkoutPending !== null}
      />

      {/* Account settings sheet for free-tier users */}
      <FreeSettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onUpgrade={handleNavUpgrade}
      />

      <div className="max-w-2xl mx-auto px-5 pt-8 pb-16">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <motion.div
              animate={{ scale: [0.88, 1.0, 0.88] }}
              transition={{ repeat: Infinity, duration: 4.5, ease: "easeInOut" }}
              style={{
                width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                background: "radial-gradient(circle at 50% 28%, #e0a8c8 0%, #cca0d8 16%, #a890d0 32%, #90a0d8 48%, #68b8d8 62%, #3ecfbe 76%, #1ab8a0 92%, #14b098 100%)",
                opacity: 0.8,
              }}
            />
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "rgba(255,255,255,0.9)", letterSpacing: "-0.02em" }}>
              Reset Anchors
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <StreakRing count={streakCount} />
            <span style={{ fontSize: 10, color: streakCount > 0 ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.2)", fontWeight: 600, letterSpacing: "0.04em" }}>
              {streakCount === 0 ? "Start today" : streakCount === 1 ? "1 day" : `${streakCount} days`}
            </span>
          </div>
        </div>

        {/* Philosophy note */}
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", lineHeight: 1.6, marginBottom: 28, maxWidth: 440 }}>
          Breathing and meditation are always free — for everyone, always.
        </p>

        {/* Recommended */}
        <RecommendedCard anchor={recommended} onStart={handleStartAnchor} />

        {/* All anchors */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "24px 0 4px" }}>
          <p style={{ fontSize: 9, color: "rgba(255,255,255,0.22)", letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600, whiteSpace: "nowrap" }}>
            All anchors
          </p>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)" }} />
        </div>

        {RESET_ANCHORS.map((anchor) => (
          <AnchorRow
            key={anchor.id}
            anchor={anchor}
            isRecommended={anchor.id === recommended.id}
            onStart={handleStartAnchor}
          />
        ))}

        {markedToday && (
          <p style={{ marginTop: 24, textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.22)" }}>
            Today&apos;s anchor is done.
          </p>
        )}

        {/* Upgrade card */}
        <UpgradeCard startCheckout={startCheckout} checkoutPending={checkoutPending} />

      </div>

      {/* Active session overlay */}
      {activeAnchor && (
        <ResetAnchorSession
          anchor={activeAnchor}
          onClose={() => setActiveAnchor(null)}
          alreadyMarkedToday={markedToday}
          streakCount={streakCount}
          onAddCompletion={handleAddCompletion}
          onUpdateCompletion={handleUpdateCompletion}
          onMarkStreak={markStreakForCompletion}
        />
      )}
    </div>
  );
}
