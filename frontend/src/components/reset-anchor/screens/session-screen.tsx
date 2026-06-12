"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, Volume2, VolumeX } from "lucide-react";
import type { ResetAnchor } from "@/lib/reset-scripts";
import {
  getActiveSoundscape,
  getHapticPatternForStep,
  getNextSoundscape,
  playBackgroundSound,
  playBreathPhaseTone,
  resetBreathPhaseToneTracking,
  stopBackgroundSound,
  triggerHaptics,
  type Soundscape,
} from "@/lib/breathing-sounds";
import {
  loadBreathePreferences,
  setBreatheMuted,
  setSoundscapeOverride,
} from "@/lib/breathing-preferences";
import { buildBreathPhaseCueKey, getBreathPhaseInfo, getOrbBreathState, getVariableLoopCycleIndex, inferBreathPhaseFromStep, isRhythmStep } from "@/lib/breath-phase";
import { useSessionWakeLock } from "@/lib/use-session-wake-lock";
import { MUTED_TEXT, FONT } from "@/components/reset-anchor/tokens";
import { BreathingOrb } from "@/components/reset-anchor/breathing-orb";

const ZEN_DELAY_MS = 10_000;
const CONTROLS_VISIBLE_MS = 4_000;

const SOUNDSCAPE_LABEL: Record<Soundscape, string> = {
  "pink-noise": "Pink",
  "brown-noise": "Brown",
  "gentle-rain": "Rain",
  forest: "Forest",
  ocean: "Ocean",
  silence: "Silent",
};

export function SessionScreen({
  anchor,
  durationSecs,
  onComplete,
  onBack,
}: {
  anchor: ResetAnchor;
  durationSecs: number;
  onComplete: (elapsed: number) => void;
  onBack: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const [animElapsed, setAnimElapsed] = useState(0);
  const [done, setDone] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [fadeKey, setFadeKey] = useState(0);
  const [stepStartSec, setStepStartSec] = useState(0);
  const [zenMode, setZenMode] = useState(false);
  const [tapRevealActive, setTapRevealActive] = useState(false);
  const [muted, setMuted] = useState(() => loadBreathePreferences().muted);
  const [soundscape, setSoundscape] = useState<Soundscape>(() =>
    getActiveSoundscape(anchor.id),
  );

  const lastHapticStepRef = useRef<number>(-999);
  const lastTonePhaseRef = useRef<string | null>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completionScheduledRef = useRef(false);

  const steps = anchor.steps;
  const isVariable = !!anchor.durationOptions;

  useSessionWakeLock(mounted && !done);

  useEffect(() => {
    if (done || !mounted) return;
    if (lastHapticStepRef.current === stepIdx) return;
    lastHapticStepRef.current = stepIdx;
    const text = steps[stepIdx]?.text ?? "";
    triggerHaptics(getHapticPatternForStep(anchor.id, stepIdx, text));
  }, [stepIdx, anchor.id, done, mounted, steps]);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    playBackgroundSound(anchor.id, { muted, soundscape });
    return () => stopBackgroundSound();
  }, [anchor.id, mounted, muted, soundscape]);

  useEffect(() => {
    if (!mounted || done) return;
    const t = setTimeout(() => {
      setZenMode(true);
      setTapRevealActive(false);
    }, ZEN_DELAY_MS);
    return () => clearTimeout(t);
  }, [mounted, done]);

  useEffect(() => {
    if (done) return;
    const start = performance.now();
    const id = setInterval(() => {
      const secs = (performance.now() - start) / 1000;
      setAnimElapsed(secs);
      setElapsed(Math.floor(secs));
    }, 100);
    return () => clearInterval(id);
  }, [done]);

  useEffect(() => {
    if (!mounted) return;
    let cum = 0;
    let idx = 0;

    if (isVariable) {
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
          setStepStartSec(animElapsed);
          resetBreathPhaseToneTracking();
          lastTonePhaseRef.current = null;
        }
        return idx;
      });
    });
  }, [elapsed, animElapsed, steps, durationSecs, isVariable, mounted]);

  useEffect(() => {
    if (elapsed < durationSecs || completionScheduledRef.current) return;

    completionScheduledRef.current = true;
    queueMicrotask(() => setDone(true));
    completeTimerRef.current = setTimeout(() => {
      completeTimerRef.current = null;
      onComplete(elapsed);
    }, 600);
  }, [elapsed, durationSecs, onComplete]);

  useEffect(() => () => {
    if (completeTimerRef.current !== null) {
      clearTimeout(completeTimerRef.current);
      completeTimerRef.current = null;
    }
  }, []);

  const progress = Math.min(1, elapsed / durationSecs);
  const step = steps[stepIdx] ?? steps[steps.length - 1];
  const isLastStep = stepIdx >= steps.length - 1;
  const rhythmStep = isRhythmStep(step);
  const phaseInfo = getBreathPhaseInfo(step, animElapsed, stepStartSec);
  const orbState = getOrbBreathState(step, animElapsed, stepStartSec);

  useEffect(() => {
    if (done || !mounted || muted) return;

    const phase = step.breathPattern
      ? phaseInfo.phase
      : inferBreathPhaseFromStep(step);
    if (!phase) return;

    const cueKey = buildBreathPhaseCueKey({
      stepIdx,
      phase,
      step,
      elapsed: animElapsed,
      stepStartSec,
      repeatCycleIndex: isVariable
        ? getVariableLoopCycleIndex(anchor, elapsed, durationSecs, stepIdx)
        : 0,
    });
    if (lastTonePhaseRef.current === cueKey) return;
    lastTonePhaseRef.current = cueKey;
    playBreathPhaseTone(phase, muted, cueKey);
  }, [done, mounted, muted, step.breathPattern, phaseInfo.phase, stepIdx, step, animElapsed, stepStartSec, isVariable, anchor, durationSecs]);

  const stepText = step.text && !isLastStep && !rhythmStep
    ? step.text.replace(/[.!?]$/, "") + " \u2026"
    : step.text;

  const { expanded, transitionSecs } = orbState;

  const showChrome = !zenMode || tapRevealActive;
  const contentFaded = zenMode && !tapRevealActive;
  const showGuidedCopy = !rhythmStep && stepText;
  const showPhaseLabel = rhythmStep && phaseInfo.label;

  const revealControls = useCallback(() => {
    if (!zenMode) return;
    setTapRevealActive(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => {
      setTapRevealActive(false);
    }, CONTROLS_VISIBLE_MS);
  }, [zenMode]);

  useEffect(() => () => {
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
  }, []);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setBreatheMuted(next);
    if (next) {
      stopBackgroundSound();
    } else {
      playBackgroundSound(anchor.id, { muted: false, soundscape });
    }
  };

  const cycleSoundscape = () => {
    const next = getNextSoundscape(anchor.id, soundscape);
    setSoundscape(next);
    setSoundscapeOverride(anchor.id, next);
    if (!muted) {
      playBackgroundSound(anchor.id, { muted: false, soundscape: next });
    }
  };

  return (
    <div
      onClick={revealControls}
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
        <div style={{ flexShrink: 0 }}>
          <BreathingOrb animation={step.animation} expanded={expanded} transitionSecs={transitionSecs} />
        </div>

        {showPhaseLabel && (
          <motion.p
            key={phaseInfo.label}
            initial={{ opacity: 0 }}
            animate={{ opacity: contentFaded ? 0.55 : 0.38 }}
            style={{
              fontSize: "clamp(0.625rem, 2.8vw, 0.75rem)",
              fontWeight: 600,
              color: "rgba(255,255,255,0.38)",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              margin: "-24px 0 0",
            }}
          >
            {phaseInfo.label}
          </motion.p>
        )}

        <AnimatePresence mode="wait">
          {showGuidedCopy && (
            <motion.div
              key={fadeKey}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: contentFaded ? 0 : 1, y: 0 }}
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
          )}
        </AnimatePresence>
      </div>

      <motion.div
        animate={{ opacity: showChrome ? 1 : 0 }}
        transition={{ duration: 0.4 }}
        style={{
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
          flexShrink: 0,
          marginTop: 50,
          pointerEvents: showChrome ? "auto" : "none",
        }}
      >
        {!rhythmStep && (
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
        )}

        <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button
            onClick={(e) => { e.stopPropagation(); onBack(); }}
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

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={(e) => { e.stopPropagation(); cycleSoundscape(); }}
              style={{
                color: "rgba(255,255,255,0.28)",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 10,
                fontFamily: FONT,
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                padding: "6px 4px",
              }}
              title="Cycle soundscape"
            >
              {SOUNDSCAPE_LABEL[soundscape]}
            </button>

            <button
              onClick={(e) => { e.stopPropagation(); toggleMute(); }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: muted ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.32)",
                padding: 4,
              }}
              title={muted ? "Unmute" : "Mute"}
            >
              {muted ? <VolumeX size={15} strokeWidth={1.5} /> : <Volume2 size={15} strokeWidth={1.5} />}
            </button>
          </div>
        </div>

        <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span
            style={{
              fontSize: "clamp(0.75rem, 3.2vw, 0.8125rem)",
              color: "rgba(255,255,255,0.28)",
              fontWeight: 600,
              fontFamily: FONT,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "70vw",
              textAlign: "center",
            }}
          >
            {anchor.title}
          </span>
        </div>
      </motion.div>
    </div>
  );
}
