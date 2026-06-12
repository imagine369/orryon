"use client";

import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight,
  Square,
  Wind,
  Anchor,
  Crosshair,
  Sun,
  Moon,
  Pause,
  Zap,
  Waves,
  Play,
  type LucideProps,
} from "lucide-react";
import {
  getRecommendedAnchor,
  getInstantAnchors,
  getSessionAnchors,
  getAnchorById,
  RESET_INTENTS,
  type ResetAnchor,
  type ResetIntent,
} from "@/lib/reset-scripts";
import {
  buildCustomLoopAnchor,
  CUSTOM_LOOP_ANCHOR_ID,
  CUSTOM_LOOP_SHORT_TITLE,
  DEFAULT_CUSTOM_LOOP,
  loadCustomBreathLoop,
  saveCustomBreathLoop,
  type CustomBreathLoop,
} from "@/lib/custom-breath-loop";
import {
  getAnchorMoodInsight,
  getRecentSessionSummaries,
} from "@/lib/reset-mood-insights";
import type { ResetCompletion } from "@/lib/use-reset-anchors";
import { primeAudioContext } from "@/lib/breathing-sounds";

type IconComponent = React.ComponentType<LucideProps>;

const ANCHOR_ICON: Record<string, IconComponent> = {
  "quick-box-reset": Square,
  "clarity-breath-2min": Wind,
  "double-inhale-destress": Zap,
  "grounding-anchor-3min": Anchor,
  "focus-return-4min": Crosshair,
  "midday-reset-5min": Sun,
  "evening-release-7min": Moon,
  "sleep-descent": Waves,
  "do-nothing": Pause,
};

const CATEGORY_LABEL: Record<string, string> = {
  breathe: "Breathe",
  ground: "Ground",
  reflect: "Reflect",
  focus: "Focus",
  release: "Release",
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "24px 0 4px" }}>
      <p style={{ fontSize: 9, color: "rgba(255,255,255,0.22)", letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600, whiteSpace: "nowrap" }}>
        {children}
      </p>
      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)" }} />
    </div>
  );
}

function InstantCard({ anchor, onStart }: { anchor: ResetAnchor; onStart: (a: ResetAnchor) => void }) {
  const featured = anchor.id === "double-inhale-destress";
  return (
    <div
      style={{
        borderRadius: 14,
        border: featured ? "1px solid rgba(255,255,255,0.14)" : "1px solid rgba(255,255,255,0.08)",
        background: featured ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)",
        padding: "14px 16px",
        marginBottom: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <AnchorIcon anchor={anchor} size={34} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {featured && (
            <p style={{ fontSize: 8, color: "rgba(255,255,255,0.28)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4, fontWeight: 600 }}>
              Fastest reset
            </p>
          )}
          <p style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.88)", marginBottom: 2 }}>
            {anchor.title}
          </p>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.34)", lineHeight: 1.4 }}>
            {anchor.tagline}
          </p>
        </div>
        <button
          onClick={() => onStart(anchor)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            borderRadius: 10,
            border: "none",
            background: "rgba(255,255,255,0.9)",
            color: "#000",
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <Play size={10} strokeWidth={2} />
          Start
        </button>
      </div>
    </div>
  );
}

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

function AnchorRow({
  anchor,
  isRecommended,
  onStart,
}: {
  anchor: ResetAnchor;
  isRecommended: boolean;
  onStart: (a: ResetAnchor) => void;
}) {
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
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", letterSpacing: "0.09em", textTransform: "uppercase", fontWeight: 600, marginBottom: 7 }}>
                {CATEGORY_LABEL[anchor.category] ?? anchor.category}
              </p>
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

function CustomLoopSection({ onStart }: { onStart: (a: ResetAnchor) => void }) {
  const [loop, setLoop] = useState<CustomBreathLoop>(() => loadCustomBreathLoop() ?? DEFAULT_CUSTOM_LOOP);
  const [saved, setSaved] = useState(() => loadCustomBreathLoop() !== null);

  const update = (patch: Partial<CustomBreathLoop>) => {
    setLoop((prev) => ({ ...prev, ...patch }));
    setSaved(false);
  };

  const handleSave = () => {
    saveCustomBreathLoop(loop);
    setSaved(true);
  };

  const handleStart = () => {
    saveCustomBreathLoop(loop);
    onStart(buildCustomLoopAnchor(loop));
  };

  const fields: { key: keyof CustomBreathLoop; label: string }[] = [
    { key: "inSecs", label: "In" },
    { key: "holdInSecs", label: "Hold" },
    { key: "outSecs", label: "Out" },
    { key: "holdOutSecs", label: "Hold" },
    { key: "cycles", label: "Cycles" },
  ];

  return (
    <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: "14px 16px" }}>
      <p style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.82)", marginBottom: 4 }}>Your Loop</p>
      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.32)", marginBottom: 14, lineHeight: 1.5 }}>
        Set inhale, hold, exhale, hold durations. Saved on this device.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {fields.map(({ key, label }) => (
          <label key={key} style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 52 }}>
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.28)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</span>
            <input
              type="number"
              min={key === "cycles" ? 1 : 0}
              max={key === "cycles" ? 20 : 15}
              value={loop[key]}
              onChange={(e) => {
                const raw = Number(e.target.value) || 0;
                const value = key === "cycles" ? Math.max(1, raw) : Math.max(0, raw);
                update({ [key]: value } as Partial<CustomBreathLoop>);
              }}
              style={{
                width: 52,
                padding: "8px 6px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.75)",
                fontSize: 13,
                textAlign: "center",
              }}
            />
          </label>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={handleSave}
          style={{
            flex: 1, padding: "10px 0", borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "transparent", color: "rgba(255,255,255,0.45)",
            fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}
        >
          {saved ? "Saved" : "Save"}
        </button>
        <button
          onClick={handleStart}
          style={{
            flex: 2, padding: "10px 0", borderRadius: 10, border: "none",
            background: "rgba(255,255,255,0.9)", color: "#000",
            fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}
        >
          Practice loop
        </button>
      </div>
    </div>
  );
}

function RecentSessions({
  completions,
}: {
  completions: ResetCompletion[];
}) {
  const recent = getRecentSessionSummaries(completions, 7);
  if (recent.length === 0) return null;

  return (
    <>
      <SectionLabel>Recent sessions</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {recent.map((s) => {
          const anchor = getAnchorById(s.anchorId);
          return (
            <div
              key={s.id}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.06)",
                background: "rgba(255,255,255,0.02)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.72)" }}>
                  {s.anchorId === CUSTOM_LOOP_ANCHOR_ID
                    ? CUSTOM_LOOP_SHORT_TITLE
                    : (anchor?.shortTitle ?? s.anchorId)}
                </p>
                <p style={{ fontSize: 10, color: "rgba(255,255,255,0.28)" }}>{s.date}</p>
              </div>
              {s.moodDelta && (
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.36)", marginTop: 4 }}>{s.moodDelta}</p>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

export interface ResetAnchorBrowseProps {
  lastUsedId?: string;
  markedToday: boolean;
  completions: ResetCompletion[];
  onStart: (anchor: ResetAnchor) => void;
}

export function ResetAnchorBrowse({
  lastUsedId,
  markedToday,
  completions,
  onStart,
}: ResetAnchorBrowseProps) {
  const [intent, setIntent] = useState<ResetIntent | null>(null);

  const recommended = useMemo(
    () => getRecommendedAnchor(lastUsedId, intent ?? undefined),
    [lastUsedId, intent],
  );

  const instantAnchors = getInstantAnchors();
  const sessionAnchors = getSessionAnchors();

  const moodInsight = getAnchorMoodInsight(completions, recommended.id);

  const handleStart = useCallback((anchor: ResetAnchor) => {
    primeAudioContext();
    onStart(anchor);
  }, [onStart]);

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        {RESET_INTENTS.map(({ id, label }) => {
          const active = intent === id;
          return (
            <button
              key={id}
              onClick={() => setIntent(active ? null : id)}
              style={{
                padding: "7px 12px",
                borderRadius: 999,
                border: active ? "1px solid rgba(255,255,255,0.22)" : "1px solid rgba(255,255,255,0.08)",
                background: active ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.02)",
                color: active ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.38)",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <SectionLabel>Instant reset</SectionLabel>
      {instantAnchors.map((anchor) => (
        <InstantCard key={anchor.id} anchor={anchor} onStart={handleStart} />
      ))}

      <RecommendedCard anchor={recommended} onStart={handleStart} />
      {moodInsight && (
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.32)", lineHeight: 1.5, marginTop: 8, marginBottom: 4 }}>
          {moodInsight}
        </p>
      )}

      <SectionLabel>Sessions</SectionLabel>
      {sessionAnchors.map((anchor) => (
        <AnchorRow
          key={anchor.id}
          anchor={anchor}
          isRecommended={anchor.id === recommended.id}
          onStart={handleStart}
        />
      ))}

      <SectionLabel>Your loop</SectionLabel>
      <CustomLoopSection onStart={handleStart} />

      <RecentSessions completions={completions} />

      {markedToday && (
        <p style={{ marginTop: 24, textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.22)" }}>
          Today&apos;s anchor is done.
        </p>
      )}
    </>
  );
}
