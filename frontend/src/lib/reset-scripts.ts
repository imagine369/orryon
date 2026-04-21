// Reset Anchor scripts — all data is local, zero network dependency.

export type ResetCategory = "breathe" | "ground" | "reflect" | "focus" | "release";

// "orb"        — standard expand/contract breathing circle
// "orb-double" — double-pulse for physiological sigh (short burst + expand)
// "none"       — text only; subtle static ring visible in background
export type ResetAnimation = "orb" | "orb-double" | "none";

export interface ResetStep {
  duration: number;     // seconds for this step
  text: string;         // on-screen guidance copy
  animation: ResetAnimation;
  /**
   * Optional breath pattern for long "orb" steps. When present, the orb
   * rhythmically expands and contracts at this cadence for the duration of
   * the step (e.g. 4 counts in, 7 counts out for the Evening Release).
   * If omitted, the orb uses the step's static expand/contract mapping.
   */
  breathPattern?: {
    inSecs: number;
    outSecs: number;
    holdInSecs?: number;   // optional hold after inhale
    holdOutSecs?: number;  // optional hold after exhale
  };
}

export interface ResetAnchor {
  id: string;
  title: string;
  shortTitle: string;   // used in the nav/recommended card where space is tight
  duration: number;     // total seconds (sum of steps — used as fallback)
  displayDuration: string; // human label e.g. "2–6 min"
  tagline: string;
  /** One-sentence evidence note shown in the info expand on the anchor list. */
  science?: string;
  category: ResetCategory;
  steps: ResetStep[];
  // If present, user can pick a duration before starting.
  durationOptions?: number[]; // in seconds, e.g. [120, 240, 360]
  defaultDurationIndex?: number;
}

// ── Scripts ─────────────────────────────────────────────────────────────────

const QUICK_BOX: ResetAnchor = {
  id: "quick-box-reset",
  title: "Quick Box Reset",
  shortTitle: "Box Reset",
  duration: 120,
  displayDuration: "3–9 min",
  tagline: "Regulate your nervous system in three minutes.",
  science: "Equal-count breathing at a 4-second cadence engages the vagal brake, directly slowing heart rate — measurable within 90 seconds. Most people notice a clear shift in mental steadiness within the first full cycle.",
  category: "breathe",
  durationOptions: [180, 360, 540],
  defaultDurationIndex: 0,
  steps: [
    {
      duration: 6,
      text: "Settle in.",
      animation: "none",
    },
    // Cycle steps — repeated to fill selected duration.
    {
      duration: 4,
      text: "Breathe in.",
      animation: "orb",
    },
    {
      duration: 4,
      text: "Hold.",
      animation: "orb",
    },
    {
      duration: 4,
      text: "Release.",
      animation: "orb",
    },
    {
      duration: 4,
      text: "Rest.",
      animation: "orb",
    },
    {
      duration: 5,
      text: "You've reset.",
      animation: "none",
    },
  ],
};

const GROUNDING_3MIN: ResetAnchor = {
  id: "grounding-anchor-3min",
  title: "3-Min Grounding Anchor",
  shortTitle: "Grounding",
  duration: 180,
  displayDuration: "3 min",
  tagline: "Return to the room when your thoughts have scattered.",
  science: "Deliberate sensory attention interrupts rumination by pulling working memory into the present — the same mechanism behind cognitive defusion in ACT. Each sensory channel uses a different neural pathway, making it harder for anxious thought loops to re-establish.",
  category: "ground",
  steps: [
    {
      duration: 30,
      text: "Breathe slowly. Arrive here.",
      animation: "orb",
      breathPattern: { inSecs: 4, outSecs: 6 },
    },
    {
      duration: 30,
      text: "Look around. Find five things you can see. Take your time.",
      animation: "none",
    },
    {
      duration: 25,
      text: "Feel four things you're touching right now.",
      animation: "none",
    },
    {
      duration: 20,
      text: "Notice three sounds. Just hear them.",
      animation: "none",
    },
    {
      duration: 15,
      text: "Two recent sensations. Warmth. Weight. Air.",
      animation: "none",
    },
    {
      duration: 20,
      text: "One thing you're grateful for. Right now.",
      animation: "none",
    },
    {
      duration: 40,
      text: "Three more breaths. You're here. Present.",
      animation: "orb",
      breathPattern: { inSecs: 4, outSecs: 6 },
    },
  ],
};

const MIDDAY_5MIN: ResetAnchor = {
  id: "midday-reset-5min",
  title: "5-Min Midday Reset",
  shortTitle: "Midday Reset",
  duration: 300,
  displayDuration: "5 min",
  tagline: "Bridge morning and afternoon with a clean separation.",
  science: "A deliberate mid-day pause improves afternoon decision quality — the brain encodes it as a boundary between two separate work periods, reducing carry-over fatigue. Even a brief body scan and breath sequence is enough to lower the cortisol accumulation built up across a demanding morning.",
  category: "reflect",
  steps: [
    {
      duration: 30,
      text: "The morning is done. Close your eyes. Let your shoulders drop.",
      animation: "none",
    },
    {
      duration: 60,
      text: "Start at your feet. Move slowly upward. Notice where you're holding. Don't fix it. Just notice.",
      animation: "none",
    },
    {
      duration: 90,
      text: "Four counts in. Six counts out. Let each exhale carry the morning with it.",
      animation: "orb",
      breathPattern: { inSecs: 4, outSecs: 6 },
    },
    {
      duration: 60,
      text: "What needs more clarity this afternoon? Don't answer. Let it sit.",
      animation: "none",
    },
    {
      duration: 60,
      text: "You have what you need. Return slowly.",
      animation: "none",
    },
  ],
};

const EVENING_7MIN: ResetAnchor = {
  id: "evening-release-7min",
  title: "7-Min Evening Release",
  shortTitle: "Evening Release",
  duration: 420,
  displayDuration: "7 min",
  tagline: "Set down the day before it follows you into the evening.",
  science: "Exhales longer than inhales activate the parasympathetic nervous system — the 4-7 ratio is among the most studied for pre-sleep regulation. Progressive muscle release alongside extended exhales accelerates the drop in core body temperature that signals the body it is time to rest.",
  category: "release",
  steps: [
    {
      duration: 30,
      text: "You don't need to solve anything right now. Let the day belong to the day.",
      animation: "none",
    },
    {
      duration: 90,
      text: "4 counts in. 7 counts out. Longer exhales activate rest. Repeat seven times.",
      animation: "orb",
      breathPattern: { inSecs: 4, outSecs: 7 },
    },
    {
      duration: 60,
      text: "Clench your fists — hold 5 seconds — release. Scrunch your face — hold 5 seconds — release. Shoulders to your ears — hold 5 seconds — release.",
      animation: "none",
    },
    {
      duration: 40,
      text: "What's one thing you completed today? Let yourself actually acknowledge it.",
      animation: "none",
    },
    {
      duration: 40,
      text: "What is something that can wait until tomorrow? Name it. Set it down.",
      animation: "none",
    },
    {
      duration: 40,
      text: "What does tonight feel like it needs? Rest. Quiet. A conversation. Food. Just notice.",
      animation: "none",
    },
    {
      duration: 90,
      text: "Nothing left to solve. Breathe slowly. Let your body get heavy.",
      animation: "orb",
      breathPattern: { inSecs: 5, outSecs: 7 },
    },
    {
      duration: 30,
      text: "Let tomorrow be tomorrow. Tonight, you rest.",
      animation: "none",
    },
  ],
};

const FOCUS_4MIN: ResetAnchor = {
  id: "focus-return-4min",
  title: "4-Min Focus Return",
  shortTitle: "Focus Return",
  duration: 240,
  displayDuration: "4 min",
  tagline: "Recover scattered attention. Return to clear, directed thinking.",
  science: "The physiological sigh followed by box breathing raises CO₂ tolerance — the primary driver of restored sustained attention after mental fragmentation. The wide-focus eye technique at the end directly expands peripheral vision, which is linked to reduced amygdala activation and a calmer attentional baseline.",
  category: "focus",
  steps: [
    {
      duration: 20,
      text: "Scattered focus is normal. Four minutes will return you to clarity.",
      animation: "none",
    },
    {
      duration: 40,
      text: "Double inhale: a full breath in through your nose, then a short sniff on top. Long exhale through your mouth, all the way out. Three times. Take your time.",
      animation: "orb-double",
    },
    {
      duration: 60,
      text: "4 counts in. 4 hold. 4 out. 4 hold. Three full cycles. Steady.",
      animation: "orb",
      breathPattern: { inSecs: 4, holdInSecs: 4, outSecs: 4, holdOutSecs: 4 },
    },
    {
      duration: 30,
      text: "Open your eyes. Find a point 6 feet away. Soft focus — let your peripheral vision widen. Keep breathing slowly.",
      animation: "none",
    },
    {
      duration: 60,
      text: "What is the one thing that matters most right now? Don't force an answer. Let it surface.",
      animation: "none",
    },
    {
      duration: 30,
      text: "Narrow your gaze. Return to presence. Begin.",
      animation: "none",
    },
  ],
};

const CLARITY_2MIN: ResetAnchor = {
  id: "clarity-breath-2min",
  title: "2-Min Clarity Breath",
  shortTitle: "Clarity Breath",
  duration: 120,
  displayDuration: "2 min",
  tagline: "When you only have two minutes, that's enough to shift.",
  science: "Two minutes of paced breathing is sufficient to shift HRV into a coherent range — the threshold at which the prefrontal cortex regains inhibitory control. Combining a physiological sigh with box breathing clears residual CO₂ faster than either technique alone, making this unusually effective for its duration.",
  category: "breathe",
  steps: [
    {
      duration: 15,
      text: "Two minutes. That's enough to shift.",
      animation: "none",
    },
    {
      duration: 45,
      text: "Double inhale through your nose — short sniff on top. Long exhale through your mouth. Twice. Slow.",
      animation: "orb-double",
    },
    {
      duration: 45,
      text: "4 in. 4 hold. 4 out. 4 hold. Three cycles. Steady.",
      animation: "orb",
      breathPattern: { inSecs: 4, holdInSecs: 4, outSecs: 4, holdOutSecs: 4 },
    },
    {
      duration: 15,
      text: "You're clear. Continue.",
      animation: "none",
    },
  ],
};

const DOUBLE_INHALE: ResetAnchor = {
  id: "double-inhale-destress",
  title: "Double Inhale Destress",
  shortTitle: "Double Inhale",
  duration: 80,
  displayDuration: "~80 sec",
  tagline: "For acute stress & quick reset.",
  science: "The two-phase inhale re-inflates collapsed alveoli and offloads CO₂ faster than any single breath — shown to reduce physiological stress markers in under 90 seconds. Five repetitions is the dose used in clinical research; fewer provides partial effect, more does not meaningfully increase benefit.",
  category: "breathe",
  steps: [
    { duration: 5,  text: "Take a full inhale through your nose. Then a sharp sniff on top. Release everything in one long exhale.", animation: "none" },
    // Sigh 1
    { duration: 4,  text: "Inhale through your nose.",    animation: "orb-double" },
    { duration: 1,  text: "Sharp sniff — pack it in.",    animation: "orb-double" },
    { duration: 8,  text: "Release. Long exhale out.",    animation: "orb" },
    { duration: 1,  text: "",                             animation: "none" },
    // Sigh 2
    { duration: 4,  text: "Inhale through your nose.",    animation: "orb-double" },
    { duration: 1,  text: "Sharp sniff — pack it in.",    animation: "orb-double" },
    { duration: 8,  text: "Release. Long exhale out.",    animation: "orb" },
    { duration: 1,  text: "",                             animation: "none" },
    // Sigh 3
    { duration: 4,  text: "Inhale through your nose.",    animation: "orb-double" },
    { duration: 1,  text: "Sharp sniff — pack it in.",    animation: "orb-double" },
    { duration: 8,  text: "Release. Long exhale out.",    animation: "orb" },
    { duration: 1,  text: "",                             animation: "none" },
    // Sigh 4
    { duration: 4,  text: "Inhale through your nose.",    animation: "orb-double" },
    { duration: 1,  text: "Sharp sniff — pack it in.",    animation: "orb-double" },
    { duration: 8,  text: "Release. Long exhale out.",    animation: "orb" },
    { duration: 1,  text: "",                             animation: "none" },
    // Sigh 5
    { duration: 4,  text: "Last one. Inhale.",            animation: "orb-double" },
    { duration: 1,  text: "Sharp sniff.",                 animation: "orb-double" },
    { duration: 8,  text: "Full release.",                animation: "orb" },
    { duration: 5,  text: "You reset your nervous system.", animation: "none" },
  ],
};

const DO_NOTHING: ResetAnchor = {
  id: "do-nothing",
  title: "Do Nothing",
  shortTitle: "Do Nothing",
  duration: 180,
  displayDuration: "3–9 min",
  tagline: "No instructions. No technique. Just stillness.",
  science: "Unstructured rest activates the default mode network, allowing recent experience to consolidate — the mental equivalent of letting sediment settle before the water clears. The absence of a task or goal is the mechanism, not a side effect; directed attention suppresses consolidation, so doing nothing is the instruction.",
  category: "release",
  durationOptions: [180, 360, 540],
  defaultDurationIndex: 0,
  steps: [
    {
      duration: 8,
      text: "Nothing to do. Nowhere to be.",
      animation: "none",
    },
    {
      duration: 30,
      text: "",
      animation: "none",
    },
    {
      duration: 8,
      text: "Whenever you're ready.",
      animation: "none",
    },
  ],
};

const SLEEP_DESCENT: ResetAnchor = {
  id: "sleep-descent",
  title: "Sleep Descent",
  shortTitle: "Sleep Descent",
  duration: 540,
  displayDuration: "9 min",
  tagline: "Bring the day to a close and let your body lead you down.",
  science: "The 4-7-8 pattern was designed specifically for sleep induction — the extended hold and long exhale shift the autonomic nervous system decisively toward parasympathetic dominance. A body scan preceding breathwork accelerates physical relaxation by engaging the same cortical inhibitory pathways that precede natural sleep onset.",
  category: "release",
  steps: [
    {
      duration: 15,
      text: "No more to do. Let the day go.",
      animation: "none",
    },
    {
      duration: 90,
      text: "Start at your feet. Move slowly upward. Feel each part go heavy — nothing to hold onto.",
      animation: "none",
    },
    {
      duration: 165,
      text: "Four counts in through your nose. Seven hold. Eight out through your mouth. Let each cycle carry you further down.",
      animation: "orb",
      breathPattern: { inSecs: 4, holdInSecs: 7, outSecs: 8, holdOutSecs: 1 },
    },
    {
      duration: 75,
      text: "Let your face go completely soft. Your jaw, your eyes, your brow — no expression needed now.",
      animation: "none",
    },
    {
      duration: 165,
      text: "Slower now. Five in. Seven hold. Ten out. Let the exhales lengthen with each breath.",
      animation: "orb",
      breathPattern: { inSecs: 5, holdInSecs: 7, outSecs: 10, holdOutSecs: 3 },
    },
    {
      duration: 30,
      text: "Sleep is close. Let it come.",
      animation: "none",
    },
  ],
};

export const RESET_ANCHORS: ResetAnchor[] = [
  QUICK_BOX,
  CLARITY_2MIN,
  DOUBLE_INHALE,
  GROUNDING_3MIN,
  FOCUS_4MIN,
  MIDDAY_5MIN,
  EVENING_7MIN,
  SLEEP_DESCENT,
  DO_NOTHING,
];

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the anchor most appropriate for the current time of day. */
export function getRecommendedAnchor(lastUsedId?: string): ResetAnchor {
  const hour = new Date().getHours();
  if (hour >= 21) return SLEEP_DESCENT;
  if (hour >= 19) return EVENING_7MIN;
  if (hour >= 12 && hour < 17) return MIDDAY_5MIN;
  const lastUsed = lastUsedId ? RESET_ANCHORS.find((a) => a.id === lastUsedId) : undefined;
  return lastUsed ?? QUICK_BOX;
}

/** Total duration of an anchor respecting variable duration selection (in seconds). */
export function resolvedDuration(anchor: ResetAnchor, durationOptionIndex?: number): number {
  if (anchor.durationOptions && durationOptionIndex !== undefined) {
    return anchor.durationOptions[durationOptionIndex] ?? anchor.durationOptions[anchor.defaultDurationIndex ?? 0];
  }
  return anchor.duration;
}
