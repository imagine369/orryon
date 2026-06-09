"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import type { ResetAnchor } from "@/lib/reset-scripts";
import { getHapticPatternForStep, triggerHaptics } from "@/lib/breathing-sounds";
import { MUTED_TEXT, FONT } from "@/components/reset-anchor/tokens";
import { BreathingOrb } from "@/components/reset-anchor/breathing-orb";
import { DurationPicker } from "./duration-picker";


export function SessionScreen({
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
  const lastHapticStepRef = useRef<number>(-999);

  const steps = anchor.steps;

  const isVariable = !!anchor.durationOptions;

  // Haptics on step changes — short phase-specific pulse at each transition.
  // Uses Navigator.vibrate (sticky user activation after the user taps to start).
  // Ref avoids double-fire in React Strict Mode for the same stepIdx.
  useEffect(() => {
    if (done || !mounted) return;
    if (lastHapticStepRef.current === stepIdx) return;
    lastHapticStepRef.current = stepIdx;
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

    queueMicrotask(() => {
      setStepIdx((prev) => {
        if (prev !== idx) {
          setFadeKey((k) => k + 1);
          setStepStartSec(elapsed);
        }
        return idx;
      });
    });
  }, [elapsed, steps, durationSecs, isVariable, mounted]);

  useEffect(() => {
    if (!done && elapsed >= durationSecs) {
      queueMicrotask(() => setDone(true));
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
        padding: "12px clamp(16px, 5vw, 24px) max(98px, calc(72px + env(safe-area-inset-bottom, 0px)))",
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
          paddingBottom: "clamp(66px, 3vh, 98px)",
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
                wordBreak: "break-word",
                overflowWrap: "anywhere",
              }}
            >
              {stepText}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Progress + bottom bar */}
      <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, flexShrink: 0, marginTop: 50 }}>
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
              fontSize: "clamp(0.75rem, 3.2vw, 0.8125rem)",
              fontFamily: FONT,
              padding: "6px 0",
              WebkitTapHighlightColor: "transparent",
              flexShrink: 0,
            }}
          >
            <ChevronLeft size={16} strokeWidth={1.5} />
            Back
          </button>

          <span
            style={{
              fontSize: "clamp(0.75rem, 3.2vw, 0.8125rem)",
              color: "rgba(255,255,255,0.28)",
              fontWeight: 600,
              fontFamily: FONT,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "50vw",
            }}
          >
            {anchor.title}
          </span>
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

