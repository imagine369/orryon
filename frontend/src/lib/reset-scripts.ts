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
}

export interface ResetAnchor {
  id: string;
  title: string;
  shortTitle: string;   // used in the nav/recommended card where space is tight
  duration: number;     // total seconds (sum of steps — used as fallback)
  displayDuration: string; // human label e.g. "2–6 min"
  tagline: string;
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
  category: "breathe",
  durationOptions: [180, 360, 540],
  defaultDurationIndex: 0,
  steps: [
    {
      duration: 6,
      text: "Settle in. This takes two minutes.",
      animation: "none",
    },
    // The remaining steps repeat the 4-4-4-4 cycle.
    // The session runner expands these into full cycles based on selected duration.
    // Steps after "entry" are cycle-based — see session runner logic.
    {
      duration: 4,
      text: "Breathe in...",
      animation: "orb",
    },
    {
      duration: 4,
      text: "Hold...",
      animation: "orb",
    },
    {
      duration: 4,
      text: "Release...",
      animation: "orb",
    },
    {
      duration: 4,
      text: "Rest...",
      animation: "orb",
    },
    {
      duration: 5,
      text: "Your system has reset.",
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
  category: "ground",
  steps: [
    {
      duration: 30,
      text: "Take three slow breaths. In through your nose, out through your mouth. Just arrive here.",
      animation: "orb",
    },
    {
      duration: 30,
      text: "Look around. Find five things you can see. Take your time naming them silently.",
      animation: "none",
    },
    {
      duration: 25,
      text: "Feel four things you can touch right now — the chair, your clothes, the air.",
      animation: "none",
    },
    {
      duration: 20,
      text: "Notice three sounds in your environment. Don't judge them. Just hear them.",
      animation: "none",
    },
    {
      duration: 15,
      text: "Recall two recent sensations — warmth, movement, texture, temperature.",
      animation: "none",
    },
    {
      duration: 20,
      text: "Name one thing you're grateful for in this exact moment.",
      animation: "none",
    },
    {
      duration: 40,
      text: "Take three final breaths. You're back. Present. Grounded.",
      animation: "orb",
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
  category: "reflect",
  steps: [
    {
      duration: 30,
      text: "The morning is done. This is your reset point. Close your eyes. Let your shoulders drop.",
      animation: "none",
    },
    {
      duration: 60,
      text: "Start at your feet. Move slowly upward. Notice where you're holding tension. Just observe — don't fix anything.",
      animation: "none",
    },
    {
      duration: 90,
      text: "4 counts in. 6 counts out. Let each exhale carry a little more of the morning with it.",
      animation: "orb",
    },
    {
      duration: 60,
      text: "What's one thing you want to bring more clarity to this afternoon? Don't answer. Just let it sit.",
      animation: "none",
    },
    {
      duration: 60,
      text: "Return slowly. Open your eyes when ready. You have what you need.",
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

export const RESET_ANCHORS: ResetAnchor[] = [
  QUICK_BOX,
  CLARITY_2MIN,
  DOUBLE_INHALE,
  GROUNDING_3MIN,
  FOCUS_4MIN,
  MIDDAY_5MIN,
  EVENING_7MIN,
  DO_NOTHING,
];

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the anchor most appropriate for the current time of day. */
export function getRecommendedAnchor(lastUsedId?: string): ResetAnchor {
  const hour = new Date().getHours();
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
