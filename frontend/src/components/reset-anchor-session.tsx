"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronLeft, Check, Volume2, VolumeX } from "lucide-react";
import type { ResetAnchor, ResetAnimation } from "@/lib/reset-scripts";
import { resolvedDuration } from "@/lib/reset-scripts";
import type { MoodState } from "@/lib/use-reset-anchors";
import {
  playBackgroundSound,
  stopBackgroundSound,
  triggerHaptics,
  getHapticPatternForStep,
  getSoundForAnchor,
} from "@/lib/breathing-sounds";

// ── Design tokens (consistent with breathing-widget.tsx) ─────────────────────

// Navy-to-purple background
const SESSION_BG  = "linear-gradient(180deg, #1e3a48 0%, #2d3a62 35%, #5a4872 68%, #7e6082 100%)";
// Orb — warm pink center (shifted high) → lavender body → teal pools at the bottom
const ORB_FILL    = "radial-gradient(circle at 50% 28%, #e0a8c8 0%, #cca0d8 16%, #a890d0 32%, #90a0d8 48%, #68b8d8 62%, #3ecfbe 76%, #1ab8a0 92%, #14b098 100%)";
const ACCENT_TEXT = "rgba(255,255,255,0.88)";
const MUTED_TEXT  = "rgba(255,255,255,0.42)";
const FONT        = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

// ── Mood data ────────────────────────────────────────────────────────────────

interface MoodOption {
  id: MoodState;
  label: string;
  icon: React.ReactNode;
}

// Minimal inline SVG icons — brand-consistent line illustrations, no emoji
function CalmIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M4 12 Q8 10 12 12 Q16 14 20 12" />
    </svg>
  );
}
function ClearIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
function ScatteredIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <line x1="7" y1="8"  x2="9"  y2="10" />
      <line x1="12" y1="6" x2="12" y2="9"  />
      <line x1="17" y1="8" x2="15" y2="10" />
      <line x1="6"  y1="14" x2="9" y2="14" />
      <line x1="15" y1="14" x2="18" y2="14" />
    </svg>
  );
}
function LowIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M5 9 Q9 9 12 13 Q15 17 19 17" />
    </svg>
  );
}
function TenseIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4,12 7,8 10,12 13,8 16,12 19,8" />
    </svg>
  );
}
function EnergizedIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M5 16 Q9 14 12 10 Q15 6 19 5" />
      <polyline points="15,5 19,5 19,9" />
    </svg>
  );
}

const MOOD_OPTIONS: MoodOption[] = [
  { id: "calm",       label: "Calm",       icon: <CalmIcon /> },
  { id: "clear",      label: "Clear",      icon: <ClearIcon /> },
  { id: "scattered",  label: "Scattered",  icon: <ScatteredIcon /> },
  { id: "low",        label: "Low",        icon: <LowIcon /> },
  { id: "tense",      label: "Tense",      icon: <TenseIcon /> },
  { id: "energized",  label: "Energized",  icon: <EnergizedIcon /> },
];

// ── Breathing animations ──────────────────────────────────────────────────────

function BreathingOrb({
  animation,
  expanded,
  transitionSecs = 4,
}: {
  animation: ResetAnimation;
  expanded: boolean;
  transitionSecs?: number;
}) {
  // Gentle idle oscillator for "none" steps — the orb breathes softly from
  // the first frame so it never appears frozen. Resets to base when a real
  // breathwork step takes over.
  const [idleExpanded, setIdleExpanded] = useState(false);

  useEffect(() => {
    if (animation !== "none") {
      setIdleExpanded(false);
      return;
    }
    const t = setTimeout(() => setIdleExpanded(true), 400);
    const id = setInterval(() => setIdleExpanded((v) => !v), 3200);
    return () => { clearTimeout(t); clearInterval(id); };
  }, [animation]);

  // Scale factor driven by animation type + phase.
  // "none" uses the idle oscillator; "orb"/"orb-double" use the caller's expanded flag.
  const scale = (() => {
    if (animation === "none")       return idleExpanded ? 1.04 : 0.94;
    if (animation === "orb-double") return expanded ? 1.18 : 0.90;
    return expanded ? 1.20 : 1.0;
  })();

  const transitionDuration = animation === "none" ? 3.2 : transitionSecs;

  return (
    <div
      style={{
        position: "relative",
        width: "clamp(200px, 62vw, 320px)",
        height: "clamp(200px, 62vw, 320px)",
        maxWidth: "min(62vw, 42vh)",
        maxHeight: "min(62vw, 42vh)",
        borderRadius: "50%",
        overflow: "hidden",
        transform: `scale(${scale})`,
        transition: `transform ${transitionDuration}s ease-in-out`,
        opacity: 0.72,
      }}
    >
      {/* Gradient ring — muted, consistent */}
      <svg
        viewBox="0 0 100 100"
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      >
        <defs>
          <linearGradient id="ra-ring-grad" x1="0.3" y1="0" x2="0.7" y2="1">
            <stop offset="0%"   stopColor="#3ecfba" stopOpacity="0.45" />
            <stop offset="50%"  stopColor="#a8c8e8" stopOpacity="0.20" />
            <stop offset="100%" stopColor="#8866a0" stopOpacity="0.08" />
          </linearGradient>
        </defs>
        <circle
          cx="50" cy="50" r="47"
          fill="none"
          stroke="url(#ra-ring-grad)"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>

      {/* Filled orb */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: ORB_FILL,
        }}
      />
    </div>
  );
}

// ── Mood picker ───────────────────────────────────────────────────────────────

function MoodPicker({
  selected,
  onSelect,
}: {
  selected?: MoodState;
  onSelect: (m: MoodState) => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 10,
        width: "100%",
        maxWidth: 320,
      }}
    >
      {MOOD_OPTIONS.map((opt) => {
          const active = selected === opt.id;
        return (
          <button
            key={opt.id}
            onClick={() => onSelect(opt.id)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
              padding: "14px 8px",
              borderRadius: 14,
              border: active
                ? "1px solid rgba(255,255,255,0.28)"
                : "1px solid rgba(255,255,255,0.09)",
              background: active ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.03)",
              color: active ? "rgba(255,255,255,0.90)" : "rgba(255,255,255,0.42)",
              cursor: "pointer",
              transition: "all 0.18s ease",
              fontFamily: FONT,
            }}
          >
            {opt.icon}
            <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.04em" }}>
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Screen types ──────────────────────────────────────────────────────────────

type Screen = "pre-mood" | "session" | "post-mood" | "completion";

// ── Pre-mood screen ───────────────────────────────────────────────────────────

function PreMoodScreen({
  anchor,
  onSkip,
  onContinue,
}: {
  anchor: ResetAnchor;
  onSkip: () => void;
  onContinue: (mood?: MoodState) => void;
}) {
  const [mood, setMood] = useState<MoodState | undefined>(undefined);

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 32px",
        gap: 0,
        fontFamily: FONT,
      }}
    >
      <p style={{ fontSize: 11, color: MUTED_TEXT, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10 }}>
        Before you begin
      </p>
      <p style={{ fontSize: 22, fontWeight: 700, color: ACCENT_TEXT, marginBottom: 6, textAlign: "center", letterSpacing: "-0.02em" }}>
        How are you feeling?
      </p>
      <p style={{ fontSize: 13, color: MUTED_TEXT, marginBottom: 36, textAlign: "center" }}>
        Optional — helps track what resets work for you.
      </p>

      <MoodPicker selected={mood} onSelect={setMood} />

      <div style={{ display: "flex", gap: 10, marginTop: 36, width: "100%", maxWidth: 320 }}>
        <button
          onClick={onSkip}
          style={{
            flex: 1,
            padding: "13px 0",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "transparent",
            color: "rgba(255,255,255,0.40)",
            fontSize: 13,
            fontFamily: FONT,
            cursor: "pointer",
          }}
        >
          Skip
        </button>
        <button
          onClick={() => onContinue(mood)}
          style={{
            flex: 2,
            padding: "13px 0",
            borderRadius: 12,
            border: "none",
          background: "rgba(255,255,255,0.92)",
          color: "#1e2540",
          fontSize: 13,
          fontWeight: 600,
          fontFamily: FONT,
          cursor: "pointer",
        }}
      >
        Begin
      </button>
      </div>
    </div>
  );
}

// ── Active session screen ─────────────────────────────────────────────────────

function SessionScreen({
  anchor,
  durationSecs,
  durationOptIdx,
  onDurationSelect,
  onComplete,
  onBack,
}: {
  anchor: ResetAnchor;
  durationSecs: number;
  durationOptIdx?: number;
  onDurationSelect?: (idx: number) => void;
  onComplete: (elapsed: number) => void;
  onBack: () => void;
}) {
  const [elapsed,      setElapsed]     = useState(0);
  const [done,         setDone]        = useState(false);
  const [mounted,      setMounted]     = useState(false);
  const [stepIdx,      setStepIdx]     = useState(0);
  const [fadeKey,      setFadeKey]     = useState(0);
  const [stepStartSec, setStepStartSec] = useState(0);

  // Sound & haptics
  const [soundEnabled, setSoundEnabled] = useState(true);
  const soundConfig = getSoundForAnchor(anchor.id);

  const steps = anchor.steps;

  const isVariable = !!anchor.durationOptions;

  // Initialize background sound for this anchor when session starts
  useEffect(() => {
    if (soundEnabled) {
      playBackgroundSound(anchor.id, 0.12);
    } else {
      stopBackgroundSound();
    }
    return () => {
      stopBackgroundSound();
    };
  }, [anchor.id, soundEnabled]);

  // Haptics on step changes — short phase-specific pulse at each transition
  useEffect(() => {
    if (done || !mounted) return;
    const text = steps[stepIdx]?.text ?? "";
    const pattern = getHapticPatternForStep(anchor.id, stepIdx, text);
    triggerHaptics(pattern);
  }, [stepIdx, anchor.id, done, mounted, steps]);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (done) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [done]);

  // Compute current step index from elapsed time
  useEffect(() => {
    if (!mounted) return;
    let cum = 0;
    let idx = 0;

    if (isVariable) {
      // Entry step (index 0), then repeating box cycle (indices 1-4), then close (last)
      const entry = steps[0];
      const close = steps[steps.length - 1];
      const cycleSteps = steps.slice(1, steps.length - 1);
      const cycleLen = cycleSteps.reduce((s, st) => s + st.duration, 0);

      if (elapsed < entry.duration) {
        idx = 0;
      } else if (elapsed >= durationSecs - close.duration) {
        idx = steps.length - 1;
      } else {
        const inCycle = (elapsed - entry.duration) % cycleLen;
        let c = 0;
        for (let i = 0; i < cycleSteps.length; i++) {
          c += cycleSteps[i].duration;
          if (inCycle < c) { idx = i + 1; break; }
        }
      }
    } else {
      for (let i = 0; i < steps.length; i++) {
        cum += steps[i].duration;
        if (elapsed < cum) { idx = i; break; }
        idx = steps.length - 1;
      }
    }

    setStepIdx((prev) => {
      if (prev !== idx) {
        setFadeKey((k) => k + 1);
        setStepStartSec(elapsed);
      }
      return idx;
    });
  }, [elapsed, steps, durationSecs, isVariable, mounted]);

  useEffect(() => {
    if (!done && elapsed >= durationSecs) {
      setDone(true);
      setTimeout(() => onComplete(elapsed), 600);
    }
  }, [elapsed, done, durationSecs, onComplete]);

  const remaining   = Math.max(0, durationSecs - elapsed);
  const progress    = Math.min(1, elapsed / durationSecs);
  const step        = steps[stepIdx] ?? steps[steps.length - 1];
  const isLastStep  = stepIdx >= steps.length - 1;

  // Append a typographic ellipsis to non-final steps so the user knows
  // more is coming. Strip any trailing sentence punctuation first so we
  // don't end up with "Settle in.…".
  const stepText = step.text && !isLastStep
    ? step.text.replace(/[.!?]$/, "") + " \u2026"
    : step.text;

  // Decide whether the orb is expanded this tick and how long the scale
  // transition should take so movement matches the actual breath pace.
  const { expanded, transitionSecs } = (() => {
    if (step.animation !== "orb") {
      return { expanded: false, transitionSecs: 4 };
    }

    const pattern = step.breathPattern;
    if (pattern) {
      const { inSecs, outSecs, holdInSecs = 0, holdOutSecs = 0 } = pattern;
      const cycleLen = inSecs + holdInSecs + outSecs + holdOutSecs;
      if (cycleLen <= 0) {
        return { expanded: false, transitionSecs: 4 };
      }
      const t = (elapsed - stepStartSec) % cycleLen;
      // Expanded during inhale AND the post-inhale hold (orb at the top).
      const isExpanded = t < inSecs + holdInSecs;
      // Match transition to the actual phase the orb is entering.
      // Rising: use inSecs. Falling: use outSecs.
      const phaseSecs = isExpanded ? inSecs : outSecs;
      return { expanded: isExpanded, transitionSecs: phaseSecs };
    }

    // Box-breathing fallback: odd-phase steps = top of breath.
    const isExpanded = stepIdx % 4 === 1 || stepIdx % 4 === 2;
    return { expanded: isExpanded, transitionSecs: 4 };
  })();

  const mins = Math.floor(remaining / 60);
  const secs = String(remaining % 60).padStart(2, "0");

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 24px 28px",
        fontFamily: FONT,
        minHeight: 0,
      }}
    >
      {/* Orb + step text — flex-shrink so they compress on short screens */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          flex: 1,
          justifyContent: "center",
          gap: "clamp(32px, 6vh, 80px)",
          minHeight: 0,
          paddingBottom: "clamp(16px, 3vh, 48px)",
        }}
      >
        <BreathingOrb animation={step.animation} expanded={expanded} transitionSecs={transitionSecs} />

        <AnimatePresence mode="wait">
          <motion.div
            key={fadeKey}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35 }}
            style={{ textAlign: "center", maxWidth: 300, padding: "0 8px" }}
          >
            <p
              style={{
                fontSize: "clamp(15px, 4vw, 18px)",
                fontWeight: 500,
                color: "rgba(255,255,255,0.29)",
                lineHeight: 1.5,
                letterSpacing: "-0.01em",
                margin: 0,
              }}
            >
              {stepText}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Progress + bottom bar */}
      <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, flexShrink: 0 }}>
        {/* Progress bar */}
        <div
          style={{
            width: "100%",
            height: 2,
            borderRadius: 2,
            background: "rgba(255,255,255,0.10)",
            overflow: "hidden",
          }}
        >
          <motion.div
            style={{ height: "100%", background: "rgba(255,255,255,0.19)", borderRadius: 2 }}
            animate={{ width: `${progress * 100}%` }}
            transition={{ duration: 0.8, ease: "linear" }}
          />
        </div>

        {/* Row 1: Back ←→ Title + mute */}
        <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button
            onClick={onBack}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              color: MUTED_TEXT,
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              fontFamily: FONT,
              padding: "6px 0",
              WebkitTapHighlightColor: "transparent",
              flexShrink: 0,
            }}
          >
            <ChevronLeft size={16} strokeWidth={1.5} />
            Back
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span
              style={{
                fontSize: 13,
                color: "rgba(255,255,255,0.28)",
                fontWeight: 600,
                fontFamily: FONT,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: "40vw",
              }}
            >
              {anchor.title}
            </span>
            <button
              onClick={() => setSoundEnabled((v) => !v)}
              title={soundEnabled ? "Mute background sound" : "Unmute background sound"}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "transparent",
                border: "none",
                color: soundEnabled ? "rgba(255,255,255,0.38)" : "rgba(255,255,255,0.18)",
                cursor: "pointer",
                padding: 0,
                flexShrink: 0,
                WebkitTapHighlightColor: "transparent",
              }}
            >
              {soundEnabled ? <Volume2 size={14} strokeWidth={1.5} /> : <VolumeX size={14} strokeWidth={1.5} />}
            </button>
          </div>
        </div>

        {/* Row 2: Duration picker on its own line so pills never overflow */}
        {anchor.durationOptions && durationOptIdx !== undefined && onDurationSelect && (
          <div style={{ width: "100%", display: "flex", justifyContent: "flex-end" }}>
            <DurationPicker
              options={anchor.durationOptions}
              selectedIdx={durationOptIdx}
              onSelect={onDurationSelect}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Post-mood + streak prompt ─────────────────────────────────────────────────

function PostMoodScreen({
  anchor,
  alreadyMarked,
  onDone,
}: {
  anchor: ResetAnchor;
  alreadyMarked: boolean;
  onDone: (params: { postMood?: MoodState; note?: string; markStreak: boolean }) => void;
}) {
  const [mood,        setMood]        = useState<MoodState | undefined>(undefined);
  const [note,        setNote]        = useState("");
  const [markStreak,  setMarkStreak]  = useState(!alreadyMarked);

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 32px 24px",
        gap: 0,
        fontFamily: FONT,
      }}
    >
      <p style={{ fontSize: 11, color: MUTED_TEXT, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10 }}>
        Reset complete
      </p>
      <p
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: ACCENT_TEXT,
          marginBottom: 6,
          textAlign: "center",
          letterSpacing: "-0.02em",
        }}
      >
        How do you feel now?
      </p>
      <p style={{ fontSize: 13, color: MUTED_TEXT, marginBottom: 28, textAlign: "center" }}>
        Optional.
      </p>

      <MoodPicker selected={mood} onSelect={setMood} />

      {/* Optional note */}
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="One sentence — anything on your mind..."
        maxLength={200}
        rows={2}
        style={{
          marginTop: 16,
          width: "100%",
          maxWidth: 320,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 12,
          padding: "12px 14px",
          color: "rgba(255,255,255,0.75)",
          fontSize: 13,
          fontFamily: FONT,
          resize: "none",
          outline: "none",
          lineHeight: 1.5,
        }}
      />

      {/* Streak toggle */}
      {!alreadyMarked && (
        <button
          onClick={() => setMarkStreak((v) => !v)}
          style={{
            marginTop: 16,
            display: "flex",
            alignItems: "center",
            gap: 10,
            width: "100%",
            maxWidth: 320,
            padding: "12px 14px",
            borderRadius: 12,
            border: markStreak
              ? "1px solid rgba(255,255,255,0.22)"
              : "1px solid rgba(255,255,255,0.09)",
            background: markStreak ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.02)",
            color: markStreak ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.38)",
            fontFamily: FONT,
            fontSize: 13,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              border: markStreak ? "none" : "1.5px solid rgba(255,255,255,0.30)",
              background: markStreak ? "rgba(255,255,255,0.88)" : "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {markStreak && <Check size={10} strokeWidth={2.5} color="#1e2540" />}
          </div>
          Mark today&apos;s Reset Anchor streak
        </button>
      )}

      {alreadyMarked && (
        <p style={{ marginTop: 14, fontSize: 12, color: MUTED_TEXT, textAlign: "center" }}>
          Today&apos;s streak is already marked.
        </p>
      )}

      <button
        onClick={() => onDone({ postMood: mood, note: note.trim() || undefined, markStreak })}
        style={{
          marginTop: 20,
          width: "100%",
          maxWidth: 320,
          padding: "14px 0",
          borderRadius: 12,
          border: "none",
          background: "rgba(255,255,255,0.92)",
          color: "#1e2540",
          fontSize: 13,
          fontWeight: 600,
          fontFamily: FONT,
          cursor: "pointer",
        }}
      >
        Done
      </button>
    </div>
  );
}

// ── Completion card ───────────────────────────────────────────────────────────

function CompletionScreen({
  anchor,
  streakCount,
  markedStreak,
  onClose,
}: {
  anchor: ResetAnchor;
  streakCount: number;
  markedStreak: boolean;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 32px",
        gap: 0,
        fontFamily: FONT,
        textAlign: "center",
      }}
    >
      {markedStreak && streakCount > 0 && (
        <p style={{ fontSize: 11, color: MUTED_TEXT, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12 }}>
          {streakCount === 1 ? "Day 1" : `${streakCount}-day streak`}
        </p>
      )}

      <p
        style={{
          fontSize: 26,
          fontWeight: 700,
          color: ACCENT_TEXT,
          letterSpacing: "-0.02em",
          lineHeight: 1.3,
          marginBottom: 10,
        }}
      >
        {anchor.id === "evening-release-7min"
          ? "Tonight, you rest."
          : anchor.id === "focus-return-4min"
          ? "You're clear. Begin."
          : "Your system has reset."}
      </p>
      <p style={{ fontSize: 14, color: MUTED_TEXT, maxWidth: 260, lineHeight: 1.6, marginBottom: 48 }}>
        {anchor.tagline}
      </p>

      <button
        onClick={onClose}
        style={{
          padding: "13px 40px",
          borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.14)",
          background: "transparent",
          color: "rgba(255,255,255,0.45)",
          fontSize: 13,
          fontFamily: FONT,
          cursor: "pointer",
        }}
      >
        Close
      </button>
    </div>
  );
}

// ── Duration picker (for Quick Box Reset) ─────────────────────────────────────

function DurationPicker({
  options,
  selectedIdx,
  onSelect,
}: {
  options: number[];
  selectedIdx: number;
  onSelect: (idx: number) => void;
}) {
  const [chosen, setChosen] = useState(false);

  const handleSelect = (idx: number) => {
    onSelect(idx);
    setChosen(true);
  };

  const toLabel = (secs: number) => secs < 60 ? `${secs}s` : `${secs / 60} min`;

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
      {options.map((secs, idx) => (
        <button
          key={idx}
          onClick={() => handleSelect(idx)}
          style={{
            padding: "5px 12px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.18)",
            background: "transparent",
            color: "rgba(255,255,255,0.55)",
            fontSize: 12,
            fontWeight: 500,
            fontFamily: FONT,
            cursor: "pointer",
            opacity: chosen && idx !== selectedIdx ? 0.25 : 1,
            transition: "opacity 0.3s ease",
            WebkitTapHighlightColor: "transparent",
            minWidth: 44,
            textAlign: "center",
          }}
        >
          {toLabel(secs)}
        </button>
      ))}
    </div>
  );
}

// ── Root session component ────────────────────────────────────────────────────

export interface ResetAnchorSessionProps {
  anchor: ResetAnchor;
  onClose: () => void;
  alreadyMarkedToday: boolean;
  streakCount: number;
  onAddCompletion: (anchorId: string, duration: number, preMood?: MoodState) => string;
  onUpdateCompletion: (id: string, postMood?: MoodState, note?: string) => void;
  onMarkStreak: (completionId: string) => void;
}

export function ResetAnchorSession({
  anchor,
  onClose,
  alreadyMarkedToday,
  streakCount,
  onAddCompletion,
  onUpdateCompletion,
  onMarkStreak,
}: ResetAnchorSessionProps) {
  const [screen,          setScreen]          = useState<Screen>("session");
  const [completionId,    setCompletionId]    = useState<string | null>(null);
  const [sessionSecs,     setSessionSecs]     = useState(0);
  const [durationOptIdx,  setDurationOptIdx]  = useState(anchor.defaultDurationIndex ?? 0);
  const [markedStreak,    setMarkedStreak]    = useState(false);
  const [container,       setContainer]       = useState<HTMLElement | null>(null);

  useEffect(() => { setContainer(document.body); }, []);

  const durationSecs = resolvedDuration(anchor, durationOptIdx);

  const handleSessionComplete = useCallback((elapsed: number) => {
    setSessionSecs(elapsed);
    const id = onAddCompletion(anchor.id, elapsed, undefined);
    setCompletionId(id);
    setScreen("post-mood");
  }, [anchor.id, onAddCompletion]);

  const handlePostMoodDone = useCallback(
    (params: { postMood?: MoodState; note?: string; markStreak: boolean }) => {
      if (completionId) {
        onUpdateCompletion(completionId, params.postMood, params.note);
        if (params.markStreak) {
          onMarkStreak(completionId);
          setMarkedStreak(true);
        }
      }
      setScreen("completion");
    },
    [completionId, onUpdateCompletion, onMarkStreak]
  );

  const overlay = (
    <AnimatePresence>
      <motion.div
        key="reset-session-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          background: SESSION_BG,
          fontFamily: FONT,
        }}
      >
        {/* Header */}
        <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px",
        }}
      >
        <div />
        <button
          onClick={onClose}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "rgba(255,255,255,0.22)",
            padding: 8,
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <X size={15} strokeWidth={1.5} />
        </button>
        </div>

        {/* Screen content */}
        <AnimatePresence mode="wait">
          {screen === "session" && (
            <motion.div
              key="session"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              style={{ display: "flex", flex: 1 }}
            >
              <SessionScreen
                anchor={anchor}
                durationSecs={durationSecs}
                durationOptIdx={durationOptIdx}
                onDurationSelect={setDurationOptIdx}
                onComplete={handleSessionComplete}
                onBack={onClose}
              />
            </motion.div>
          )}

          {screen === "post-mood" && (
            <motion.div
              key="post-mood"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              style={{ display: "flex", flex: 1 }}
            >
              <PostMoodScreen
                anchor={anchor}
                alreadyMarked={alreadyMarkedToday}
                onDone={handlePostMoodDone}
              />
            </motion.div>
          )}

          {screen === "completion" && (
            <motion.div
              key="completion"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              style={{ display: "flex", flex: 1 }}
            >
              <CompletionScreen
                anchor={anchor}
                streakCount={streakCount + (markedStreak ? 1 : 0)}
                markedStreak={markedStreak}
                onClose={onClose}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );

  if (!container) return null;
  return createPortal(overlay, container);
}
