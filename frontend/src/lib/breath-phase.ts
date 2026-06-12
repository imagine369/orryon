import type { ResetStep } from "@/lib/reset-scripts";

export type BreathPhaseKind = "inhale" | "hold-in" | "exhale" | "hold-out";

export interface BreathPhaseInfo {
  phase: BreathPhaseKind | null;
  label: string | null;
  phaseSecs: number;
}

/** Steps driven by a repeating breath pattern with no on-screen copy — phase labels only. */
export function isRhythmStep(step: ResetStep): boolean {
  return !!step.breathPattern && !step.text.trim();
}

/** Map discrete orb step copy to a breath phase tone. */
export function inferBreathPhaseFromStep(step: ResetStep): BreathPhaseKind | null {
  if (step.animation !== "orb" && step.animation !== "orb-double") {
    return null;
  }
  return inferBreathPhaseFromText(step.text);
}

export function inferBreathPhaseFromText(text: string): BreathPhaseKind | null {
  const lower = text.toLowerCase().trim();
  if (!lower) return null;
  if (/sharp sniff|pack it in|second sniff/.test(lower)) return "hold-in";
  if (/inhale|breathe in|breath in/.test(lower)) return "inhale";
  if (/\bhold\b|pause|stay/.test(lower)) return "hold-in";
  if (/\brest\b/.test(lower)) return "hold-out";
  if (/exhale|release|let go|long exhale/.test(lower) || /\bout\b/.test(lower)) {
    return "exhale";
  }
  return null;
}

/** True when this step should emit inhale/exhale/hold phase tones. */
export function shouldPlayBreathPhaseTone(step: ResetStep): boolean {
  if (step.breathPattern) return true;
  return inferBreathPhaseFromStep(step) !== null;
}

/** Variable-duration loops can revisit the same step index — include loop cycle in cue keys. */
export function getVariableLoopCycleIndex(
  anchor: { durationOptions?: number[]; steps: ResetStep[] },
  elapsed: number,
  durationSecs: number,
  stepIdx: number,
): number {
  if (!anchor.durationOptions?.length) return 0;

  const steps = anchor.steps;
  const entry = steps[0];
  const close = steps[steps.length - 1];
  if (stepIdx <= 0 || stepIdx >= steps.length - 1) return 0;
  if (elapsed < entry.duration || elapsed >= durationSecs - close.duration) return 0;

  const cycleSteps = steps.slice(1, steps.length - 1);
  const cycleLen = cycleSteps.reduce((sum, step) => sum + step.duration, 0);
  if (cycleLen <= 0) return 0;

  return Math.floor((elapsed - entry.duration) / cycleLen);
}

/** Index of the current repeating breath cycle within a patterned step. */
export function getBreathPatternCycleIndex(
  step: ResetStep,
  elapsed: number,
  stepStartSec: number,
): number {
  const pattern = step.breathPattern;
  if (!pattern) return 0;

  const cycleLen =
    pattern.inSecs +
    (pattern.holdInSecs ?? 0) +
    pattern.outSecs +
    (pattern.holdOutSecs ?? 0);
  if (cycleLen <= 0) return 0;

  const t = elapsed - stepStartSec;
  if (t < 0) return 0;
  return Math.floor(t / cycleLen);
}

/** Stable cue id so inhale/exhale tones repeat every cycle, not just once per step. */
export function buildBreathPhaseCueKey(options: {
  stepIdx: number;
  phase: BreathPhaseKind;
  step: ResetStep;
  elapsed: number;
  stepStartSec: number;
  repeatCycleIndex?: number;
}): string {
  const { stepIdx, phase, step, elapsed, stepStartSec, repeatCycleIndex = 0 } = options;
  if (step.breathPattern) {
    const cycle = getBreathPatternCycleIndex(step, elapsed, stepStartSec);
    return `${stepIdx}:${cycle}:${phase}`;
  }
  if (repeatCycleIndex > 0) {
    return `step:${repeatCycleIndex}:${stepIdx}:${phase}`;
  }
  return `step:${stepIdx}:${phase}`;
}

/** Derive the current breath phase label for rhythm steps. */
export function getBreathPhaseInfo(
  step: ResetStep,
  elapsed: number,
  stepStartSec: number,
): BreathPhaseInfo {
  const pattern = step.breathPattern;
  if (!pattern) {
    return { phase: null, label: null, phaseSecs: 4 };
  }

  const { inSecs, outSecs, holdInSecs = 0, holdOutSecs = 0 } = pattern;
  const cycleLen = inSecs + holdInSecs + outSecs + holdOutSecs;
  if (cycleLen <= 0) {
    return { phase: null, label: null, phaseSecs: 4 };
  }

  const t = (elapsed - stepStartSec) % cycleLen;
  if (t < inSecs) {
    return { phase: "inhale", label: `Inhale · ${inSecs}s`, phaseSecs: inSecs };
  }
  if (t < inSecs + holdInSecs) {
    return { phase: "hold-in", label: `Hold · ${holdInSecs}s`, phaseSecs: holdInSecs };
  }
  if (t < inSecs + holdInSecs + outSecs) {
    return { phase: "exhale", label: `Exhale · ${outSecs}s`, phaseSecs: outSecs };
  }
  return { phase: "hold-out", label: `Hold · ${holdOutSecs}s`, phaseSecs: holdOutSecs };
}

export interface OrbBreathState {
  expanded: boolean;
  /** Seconds for the current inhale/exhale transition. */
  transitionSecs: number;
}

/** Orb expand/contract state — shared by every breathe exercise. */
export function getOrbBreathState(
  step: ResetStep,
  animElapsed: number,
  stepStartSec: number,
): OrbBreathState {
  if (step.animation !== "orb" && step.animation !== "orb-double") {
    return { expanded: false, transitionSecs: 3.2 };
  }

  if (step.breathPattern) {
    const phaseInfo = getBreathPhaseInfo(step, animElapsed, stepStartSec);
    if (!phaseInfo.phase) {
      return { expanded: false, transitionSecs: 4 };
    }
    const expanded = phaseInfo.phase === "inhale" || phaseInfo.phase === "hold-in";
    return {
      expanded,
      transitionSecs: Math.max(0.35, phaseInfo.phaseSecs),
    };
  }

  const discretePhase = inferBreathPhaseFromStep(step);
  if (discretePhase) {
    const expanded = discretePhase === "inhale" || discretePhase === "hold-in";
    return {
      expanded,
      transitionSecs: Math.max(0.35, step.duration),
    };
  }

  return { expanded: false, transitionSecs: 4 };
}
