"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Square, Wind, Anchor, Crosshair, Sun, Moon, Pause, Zap, Waves, Play, type LucideProps } from "lucide-react";
import { useResetAnchors } from "@/lib/use-reset-anchors";
import { RESET_ANCHORS, getRecommendedAnchor, type ResetAnchor } from "@/lib/reset-scripts";
import { ResetAnchorSession } from "@/components/reset-anchor-session";
import { primeAudioContext } from "@/lib/breathing-sounds";
import type { MoodState } from "@/lib/use-reset-anchors";

// ── Per-anchor icon ────────────────────────────────────────────────────────────

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

// ── Page ───────────────────────────────────────────────────────────────────────

export default function BreathePage() {
  const { lastUsedId, markedToday, streakCount, addCompletion, updateCompletion, markStreakForCompletion } = useResetAnchors();

  const [activeAnchor, setActiveAnchor] = useState<ResetAnchor | null>(null);

  const handleStartAnchor = useCallback((anchor: ResetAnchor) => {
    primeAudioContext();
    setActiveAnchor(anchor);
  }, []);

  const recommended = getRecommendedAnchor(lastUsedId);

  const handleAddCompletion = (anchorId: string, duration: number, preMood?: MoodState): string =>
    addCompletion({ anchorId, duration, preMood }).id;

  const handleUpdateCompletion = (id: string, postMood?: MoodState, note?: string) =>
    updateCompletion(id, { postMood, note });

  return (
    <div className="min-h-full bg-black text-white">
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
