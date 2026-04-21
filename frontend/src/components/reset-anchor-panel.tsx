"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Play, ChevronRight, Square, Wind, Anchor, Crosshair, Sun, Moon, Pause, Zap, Waves, type LucideProps } from "lucide-react";
import { usePanels } from "@/lib/panel-context";
import { useResetAnchors } from "@/lib/use-reset-anchors";
import { RESET_ANCHORS, getRecommendedAnchor, type ResetAnchor } from "@/lib/reset-scripts";
import { ResetAnchorSession } from "@/components/reset-anchor-session";
import type { MoodState } from "@/lib/use-reset-anchors";

// ── Per-anchor icon ───────────────────────────────────────────────────────────

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

function AnchorIcon({ anchor, size = 28 }: { anchor: ResetAnchor; size?: number }) {
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
        padding: pad,
      }}
    >
      <Icon
        size={size - pad * 2}
        strokeWidth={1.4}
        color="rgba(255,255,255,0.50)"
      />
    </div>
  );
}

// ── Category labels ───────────────────────────────────────────────────────────

const CATEGORY_LABEL: Record<string, string> = {
  breathe: "Breathe",
  ground:  "Ground",
  reflect: "Reflect",
  focus:   "Focus",
  release: "Release",
};

// ── Streak ring (minimal SVG arc) ─────────────────────────────────────────────

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
        {/* Track */}
        <circle cx="14" cy="14" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="1.5" />
        {/* Progress */}
        {count > 0 && (
          <circle
            cx="14" cy="14" r={r}
            fill="none"
            stroke="rgba(255,255,255,0.45)"
            strokeWidth="1.5"
            strokeDasharray={`${dash} ${gap}`}
            strokeLinecap="round"
          />
        )}
      </svg>
      <span
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 8,
          fontWeight: 700,
          color: count > 0 ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.2)",
          letterSpacing: "-0.02em",
          lineHeight: 1,
        }}
      >
        {count}
      </span>
    </div>
  );
}

// ── Recommended hero card ─────────────────────────────────────────────────────

function RecommendedCard({
  anchor,
  onStart,
}: {
  anchor: ResetAnchor;
  onStart: (anchor: ResetAnchor) => void;
}) {
  return (
    <div
      style={{
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.09)",
        background: "rgba(255,255,255,0.04)",
        padding: "18px 18px 16px",
        marginBottom: 4,
      }}
    >
      <p
        style={{
          fontSize: 9,
          color: "rgba(255,255,255,0.28)",
          letterSpacing: "0.13em",
          textTransform: "uppercase",
          marginBottom: 10,
          fontWeight: 600,
        }}
      >
        Recommended
      </p>

      <div style={{ marginBottom: 14 }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          background: "radial-gradient(circle at 50% 28%, #e0a8c8 0%, #cca0d8 16%, #a890d0 32%, #90a0d8 48%, #68b8d8 62%, #3ecfbe 76%, #1ab8a0 92%, #14b098 100%)",
          opacity: 0.72,
        }} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: 17,
              fontWeight: 700,
              color: "rgba(255,255,255,0.9)",
              letterSpacing: "-0.02em",
              lineHeight: 1.25,
              marginBottom: 5,
            }}
          >
            {anchor.title}
          </p>
          <p
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.38)",
              lineHeight: 1.5,
              marginBottom: 14,
              maxWidth: 240,
            }}
          >
            {anchor.tagline}
          </p>
        </div>
        <span
          style={{
            fontSize: 10,
            color: "rgba(255,255,255,0.28)",
            fontWeight: 600,
            letterSpacing: "0.04em",
            marginLeft: 8,
            whiteSpace: "nowrap",
            marginTop: 2,
          }}
        >
          {anchor.displayDuration}
        </span>
      </div>

      <button
        onClick={() => onStart(anchor)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 18px",
          borderRadius: 10,
          border: "none",
          background: "rgba(255,255,255,0.9)",
          color: "#000",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          transition: "opacity 0.15s ease",
        }}
      >
        <Play size={11} strokeWidth={2} />
        Start now
      </button>
    </div>
  );
}

// ── Anchor list row ───────────────────────────────────────────────────────────

function AnchorRow({
  anchor,
  isRecommended,
  onStart,
}: {
  anchor: ResetAnchor;
  isRecommended: boolean;
  onStart: (anchor: ResetAnchor) => void;
}) {
  // Hover (desktop) and tap-toggle (mobile) both reveal the info box.
  const [showInfo, setShowInfo] = useState(false);
  // Track whether the pointer is a true hover device so we don't leave the
  // info box stuck open after a tap on desktop touchscreens.
  const isHoverDevice = useRef(
    typeof window !== "undefined" && window.matchMedia("(hover: hover)").matches
  );

  const handleRowClick = () => {
    // On hover-capable devices the hover already shows/hides; a click pins or
    // dismisses. On touch-only devices click is the only trigger.
    if (!isHoverDevice.current) {
      setShowInfo((v) => !v);
    }
  };

  return (
    <div
      onClick={handleRowClick}
      onMouseEnter={() => isHoverDevice.current && setShowInfo(true)}
      onMouseLeave={() => isHoverDevice.current && setShowInfo(false)}
      style={{
        padding: "14px 0",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        cursor: anchor.science ? "default" : undefined,
      }}
    >
      {/* Main row */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {/* Category orb */}
        <AnchorIcon anchor={anchor} size={30} />

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <p
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "rgba(255,255,255,0.85)",
                letterSpacing: "-0.01em",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {anchor.title}
            </p>
            {isRecommended && (
              <span
                style={{
                  fontSize: 8,
                  color: "rgba(255,255,255,0.28)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 4,
                  padding: "1px 5px",
                  letterSpacing: "0.06em",
                  whiteSpace: "nowrap",
                }}
              >
                NOW
              </span>
            )}
          </div>
          <p
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.32)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {anchor.tagline}
          </p>
        </div>

        {/* Duration + start */}
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", fontWeight: 600, letterSpacing: "0.03em" }}>
            {anchor.displayDuration}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onStart(anchor); }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 28,
              height: 28,
              borderRadius: "50%",
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.04)",
              color: "rgba(255,255,255,0.55)",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <ChevronRight size={13} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {/* Info expand — science note */}
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
            <div
              style={{
                marginTop: 10,
                marginLeft: 44,
                padding: "10px 14px",
                borderRadius: 10,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              <p
                style={{
                  fontSize: 11,
                  color: "rgba(255,255,255,0.28)",
                  letterSpacing: "0.09em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                  marginBottom: 7,
                }}
              >
                {CATEGORY_LABEL[anchor.category] ?? anchor.category}
              </p>
              <p
                style={{
                  fontSize: 13,
                  color: "rgba(255,255,255,0.52)",
                  lineHeight: 1.7,
                  letterSpacing: "0.01em",
                }}
              >
                {anchor.science}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Panel root ────────────────────────────────────────────────────────────────

export function ResetAnchorPanel() {
  const { openPanel, close } = usePanels();
  const isOpen = openPanel === "reset";

  const {
    lastUsedId,
    markedToday,
    streakCount,
    addCompletion,
    updateCompletion,
    markStreakForCompletion,
  } = useResetAnchors();

  const [activeAnchor, setActiveAnchor] = useState<ResetAnchor | null>(null);

  const recommended = getRecommendedAnchor(lastUsedId);

  const handleStart = (anchor: ResetAnchor) => {
    setActiveAnchor(anchor);
  };

  const handleSessionClose = () => {
    setActiveAnchor(null);
  };

  const handleAddCompletion = (
    anchorId: string,
    duration: number,
    preMood?: MoodState
  ): string => {
    return addCompletion({ anchorId, duration, preMood }).id;
  };

  const handleUpdateCompletion = (id: string, postMood?: MoodState, note?: string) => {
    updateCompletion(id, { postMood, note });
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="reset-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
              onClick={close}
            />

            {/* Panel */}
            <motion.div
              key="reset-panel"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 32, mass: 0.9 }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={{ left: 0, right: 0.2 }}
              onDragEnd={(_, info) => {
                if (info.offset.x > 80 || info.velocity.x > 500) close();
              }}
              className="fixed top-0 right-0 h-full z-50 flex flex-col"
              style={{ width: "95vw", maxWidth: 600 }}
            >
              <div
                className="h-full rounded-l-2xl flex flex-col overflow-hidden"
                style={{ background: "#080808" }}
              >
                {/* Header */}
                <div
                  className="shrink-0"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "16px 20px",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {/* Mini animated orb */}
                    <motion.div
                      animate={{ scale: [0.88, 1.0, 0.88] }}
                      transition={{ repeat: Infinity, duration: 4.5, ease: "easeInOut" }}
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        border: "1.2px solid rgba(255,255,255,0.35)",
                        background: "rgba(255,255,255,0.06)",
                        flexShrink: 0,
                      }}
                    />
                    <h1
                      style={{
                        fontSize: 20,
                        fontWeight: 800,
                        color: "rgba(255,255,255,0.9)",
                        letterSpacing: "-0.02em",
                        lineHeight: 1,
                      }}
                    >
                      Reset Anchors
                    </h1>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <StreakRing count={streakCount} />
                      <span
                        style={{
                          fontSize: 10,
                          color: streakCount > 0 ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.2)",
                          fontWeight: 600,
                          letterSpacing: "0.04em",
                        }}
                      >
                        {streakCount === 0
                          ? "Start today"
                          : streakCount === 1
                          ? "1 day"
                          : `${streakCount} days`}
                      </span>
                    </div>
                    <button
                      onClick={close}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 30,
                        height: 30,
                        borderRadius: "50%",
                        background: "rgba(255,255,255,0.05)",
                        border: "none",
                        cursor: "pointer",
                        color: "rgba(255,255,255,0.5)",
                      }}
                    >
                      <X size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                </div>

                {/* Scrollable content */}
                <div
                  className="flex-1 overflow-y-auto"
                  style={{ padding: "16px 20px 32px" }}
                >
                  {/* Recommended hero */}
                  <RecommendedCard anchor={recommended} onStart={handleStart} />

                  {/* Divider + "All anchors" label */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      margin: "20px 0 4px",
                    }}
                  >
                    <p
                      style={{
                        fontSize: 9,
                        color: "rgba(255,255,255,0.22)",
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                      }}
                    >
                      All anchors
                    </p>
                    <div
                      style={{
                        flex: 1,
                        height: 1,
                        background: "rgba(255,255,255,0.05)",
                      }}
                    />
                  </div>

                  {/* Anchor list */}
                  {RESET_ANCHORS.map((anchor) => (
                    <AnchorRow
                      key={anchor.id}
                      anchor={anchor}
                      isRecommended={anchor.id === recommended.id}
                      onStart={handleStart}
                    />
                  ))}

                  {/* Today marker */}
                  {markedToday && (
                    <p
                      style={{
                        marginTop: 24,
                        textAlign: "center",
                        fontSize: 11,
                        color: "rgba(255,255,255,0.22)",
                      }}
                    >
                      Today&apos;s anchor is done.
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Active session overlay */}
      {activeAnchor && (
        <ResetAnchorSession
          anchor={activeAnchor}
          onClose={handleSessionClose}
          alreadyMarkedToday={markedToday}
          streakCount={streakCount}
          onAddCompletion={handleAddCompletion}
          onUpdateCompletion={handleUpdateCompletion}
          onMarkStreak={markStreakForCompletion}
        />
      )}
    </>
  );
}
