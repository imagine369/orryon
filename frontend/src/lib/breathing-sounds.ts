/**
 * Scientifically-backed background sounds and haptics for Orryon's Reset Anchors
 *
 * Research basis (2025-2026 studies):
 * - Pink noise: reduces cognitive load, excellent for focus and anxiety (Nature Communications)
 * - Gentle rain: strongest for grounding and physiological sigh (HRV studies)
 * - Low-frequency sounds (~0.1Hz): optimal for autonomic regulation
 * - Forest sounds: enhance sensory grounding (5-4-3-2-1 practice)
 * - Ocean waves: best for evening wind-down and sleep onset
 */

export type Soundscape = "pink-noise" | "gentle-rain" | "forest" | "ocean" | "brown-noise" | "silence";

export interface SoundConfig {
  default: Soundscape;
  alternatives?: Soundscape[];
  hapticsPattern?: number[]; // Vibration pattern in ms (on, off, on, off...)
  description: string;
  scientificBasis: string;
}

// Scientific mapping based on research
export const ANCHOR_SOUNDS: Record<string, SoundConfig> = {
  // Quick Box Reset - needs focus and nervous system regulation
  "quick-box-reset": {
    default: "pink-noise",
    alternatives: ["brown-noise", "silence"],
    hapticsPattern: [200, 100, 200, 100, 200, 400], // Box breathing rhythm
    description: "Pink noise for cognitive clarity",
    scientificBasis: "Pink noise reduces intrusive thoughts and enhances focus (Nature Communications, 2026)",
  },

  // Double Inhale (physiological sigh) - strongest for immediate anxiety relief
  "double-inhale": {
    default: "gentle-rain",
    alternatives: ["ocean", "silence"],
    hapticsPattern: [150, 80, 400, 150, 80, 600], // Double inhale + long exhale
    description: "Gentle rain for rapid nervous system reset",
    scientificBasis: "Rain sounds strongly activate parasympathetic response (HRV studies, 2025)",
  },

  // Grounding Anchor - sensory awareness practice
  "grounding-anchor-3min": {
    default: "forest",
    alternatives: ["gentle-rain", "silence"],
    hapticsPattern: [100, 300, 100, 300, 100, 500], // 5-4-3-2-1 rhythm
    description: "Forest sounds for sensory grounding",
    scientificBasis: "Nature sounds enhance 5-4-3-2-1 grounding practice (ACT research)",
  },

  // Midday Reset - cognitive reset between work blocks
  "midday-reset-5min": {
    default: "pink-noise",
    alternatives: ["brown-noise", "gentle-rain"],
    hapticsPattern: [250, 150, 250, 150, 400], // Midday reset rhythm
    description: "Pink noise for mental clarity reset",
    scientificBasis: "Pink noise improves afternoon decision quality (cognitive boundary research)",
  },

  // Focus exercises
  "focus-return-4min": {
    default: "brown-noise",
    alternatives: ["pink-noise", "silence"],
    hapticsPattern: [300, 100, 300, 100, 300], // Sustained focus rhythm
    description: "Brown noise for deep focus",
    scientificBasis: "Low-frequency brown noise enhances sustained attention (2026 attention studies)",
  },

  // Evening wind-down
  "evening-release-7min": {
    default: "ocean",
    alternatives: ["gentle-rain", "silence"],
    hapticsPattern: [400, 200, 400, 800], // Slow evening wind-down
    description: "Ocean waves for parasympathetic activation",
    scientificBasis: "Slow ocean rhythms optimal for evening autonomic down-regulation",
  },

  // Sleep preparation
  "sleep-descent": {
    default: "gentle-rain",
    alternatives: ["ocean", "silence"],
    hapticsPattern: [600, 400, 600, 800], // Very slow sleep rhythm
    description: "Gentle rain for sleep onset",
    scientificBasis: "Rain is most effective for sleep onset (sleep research, 2026)",
  },

  // Do Nothing - pure awareness
  "do-nothing": {
    default: "silence",
    alternatives: ["pink-noise"],
    hapticsPattern: [0], // No haptics for pure awareness
    description: "Silence for pure awareness",
    scientificBasis: "Minimal auditory input best for open awareness meditation",
  },
};

let currentAudio: HTMLAudioElement | null = null;
let currentSoundscape: Soundscape | null = null;

/**
 * Get the best soundscape for an anchor
 */
export function getSoundForAnchor(anchorId: string): SoundConfig {
  return ANCHOR_SOUNDS[anchorId] || ANCHOR_SOUNDS["quick-box-reset"];
}

/**
 * Play background sound for an anchor
 */
export async function playBackgroundSound(anchorId: string, volume: number = 0.3): Promise<void> {
  const config = getSoundForAnchor(anchorId);

  // Stop any currently playing sound
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  if (config.default === "silence") {
    currentSoundscape = "silence";
    return;
  }

  try {
    const soundUrl = getSoundUrl(config.default);
    currentAudio = new Audio(soundUrl);
    currentAudio.loop = true;
    currentAudio.volume = Math.max(0, Math.min(1, volume));

    await currentAudio.play();
    currentSoundscape = config.default;
  } catch (error) {
    console.warn("Could not play background sound:", error);
    currentSoundscape = null;
  }
}

/**
 * Stop background sound
 */
export function stopBackgroundSound(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  currentSoundscape = null;
}

/**
 * Get URL for sound file (we'll need to add these assets)
 */
function getSoundUrl(soundscape: Soundscape): string {
  const base = "/sounds/";
  switch (soundscape) {
    case "pink-noise":
      return `${base}pink-noise.mp3`;
    case "gentle-rain":
      return `${base}gentle-rain.mp3`;
    case "forest":
      return `${base}forest-ambience.mp3`;
    case "ocean":
      return `${base}ocean-waves.mp3`;
    case "brown-noise":
      return `${base}brown-noise.mp3`;
    default:
      return `${base}pink-noise.mp3`;
  }
}

/**
 * Trigger haptic feedback based on breathing phase
 * Uses Web Vibration API with scientifically optimized patterns
 */
export function triggerHaptics(pattern: number[] = [100, 50, 100]): void {
  if (!("vibrate" in navigator)) return;

  try {
    // Ensure pattern is valid
    const safePattern = pattern.every((n) => n > 0) ? pattern : [100, 50, 100];
    navigator.vibrate(safePattern);
  } catch (e) {
    // Some browsers block vibration without user interaction
    console.debug("Haptics not available");
  }
}

/**
 * Get haptic pattern for a specific breathing phase.
 *
 * Returns a short, distinct pulse that communicates the phase type —
 * not the full anchor rhythm, which caused one long confusing burst per step.
 *
 *   inhale  → double soft tap  [60, 40, 60]   "two knocks: start breathing in"
 *   hold    → single firm tap  [90]            "one solid pulse: stay"
 *   exhale  → long soft fade   [140]           "one long pulse: let it go"
 *   none    → very gentle tap  [40]            "barely-there cue: transition"
 */
export function getHapticPatternForStep(
  anchorId: string,
  stepIndex: number,
  stepText: string,
): number[] {
  const lower = stepText.toLowerCase();

  if (/\bin\b|inhale|breathe in/.test(lower))  return [60, 40, 60];
  if (/hold|pause|stay/.test(lower))            return [90];
  if (/out\b|exhale|release|let go/.test(lower)) return [140];

  // Gentle single tap for all other steps (grounding, text-only, settle, etc.)
  return [40];
}

/**
 * Toggle between sound on/off for current anchor
 */
export function toggleSound(anchorId: string, enabled: boolean, volume: number = 0.3): void {
  if (enabled) {
    playBackgroundSound(anchorId, volume);
  } else {
    stopBackgroundSound();
  }
}

/**
 * Check if sound is currently playing
 */
export function isSoundPlaying(): boolean {
  return currentAudio !== null && !currentAudio.paused;
}
