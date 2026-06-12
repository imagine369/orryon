import { getAnchorById, type ResetAnchor } from "@/lib/reset-scripts";

export interface CustomBreathLoop {
  inSecs: number;
  holdInSecs: number;
  outSecs: number;
  holdOutSecs: number;
  cycles: number;
}

export const CUSTOM_LOOP_ANCHOR_ID = "custom-loop";
export const CUSTOM_LOOP_SHORT_TITLE = "Your Loop";
const STORAGE_KEY = "orryon_custom_breath_loop";

export const DEFAULT_CUSTOM_LOOP: CustomBreathLoop = {
  inSecs: 4,
  holdInSecs: 4,
  outSecs: 4,
  holdOutSecs: 4,
  cycles: 6,
};

export function loadCustomBreathLoop(): CustomBreathLoop | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CustomBreathLoop;
    if (
      typeof parsed.inSecs === "number" &&
      typeof parsed.holdInSecs === "number" &&
      typeof parsed.outSecs === "number" &&
      typeof parsed.holdOutSecs === "number" &&
      typeof parsed.cycles === "number"
    ) {
      return { ...parsed, cycles: Math.max(1, parsed.cycles) };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveCustomBreathLoop(loop: CustomBreathLoop): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(loop));
  } catch { /* ignore */ }
}

/** Resolve ?start= deep-link ids, including saved custom loops. */
export function resolveStartAnchor(startId: string): ResetAnchor | null {
  if (startId === CUSTOM_LOOP_ANCHOR_ID) {
    const loop = loadCustomBreathLoop();
    return loop ? buildCustomLoopAnchor(loop) : null;
  }
  return getAnchorById(startId) ?? null;
}

export function buildCustomLoopAnchor(loop: CustomBreathLoop): ResetAnchor {
  const cycles = Math.max(1, loop.cycles);
  const cycleLen =
    loop.inSecs + loop.holdInSecs + loop.outSecs + loop.holdOutSecs;
  const breathDuration = cycleLen * cycles;
  const totalDuration = 5 + breathDuration + 5;

  return {
    id: CUSTOM_LOOP_ANCHOR_ID,
    title: "Your Loop",
    shortTitle: CUSTOM_LOOP_SHORT_TITLE,
    duration: totalDuration,
    displayDuration: `${Math.max(1, Math.round(totalDuration / 60))} min`,
    tagline: "Your personal breathing rhythm.",
    category: "breathe",
    steps: [
      { duration: 5, text: "Settle in.", animation: "none" },
      {
        duration: breathDuration,
        text: "",
        animation: "orb",
        breathPattern: {
          inSecs: loop.inSecs,
          holdInSecs: loop.holdInSecs,
          outSecs: loop.outSecs,
          holdOutSecs: loop.holdOutSecs,
        },
      },
      { duration: 5, text: "Done.", animation: "none" },
    ],
  };
}
