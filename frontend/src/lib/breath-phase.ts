import type { ResetStep } from "@/lib/reset-scripts";

export type BreathPhaseKind = "inhale" | "hold-in" | "exhale" | "hold-out";

export interface BreathPhaseInfo {
  phase: BreathPhaseKind | null;
  label: string | null;
  phaseSecs: number;
}

/** Steps driven by a repeating breath pattern — phase labels only, no guided copy. */
export function isRhythmStep(step: ResetStep): boolean {
  return !!step.breathPattern;
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
