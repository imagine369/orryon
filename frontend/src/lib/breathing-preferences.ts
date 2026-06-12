import type { Soundscape } from "@/lib/breathing-sounds";

const PREFS_KEY = "orryon_breathe_prefs";

export interface BreathePreferences {
  muted: boolean;
  soundscapeOverrides: Record<string, Soundscape>;
}

const DEFAULT_PREFS: BreathePreferences = {
  muted: false,
  soundscapeOverrides: {},
};

export function loadBreathePreferences(): BreathePreferences {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<BreathePreferences>;
    return {
      muted: !!parsed.muted,
      soundscapeOverrides: parsed.soundscapeOverrides ?? {},
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function saveBreathePreferences(prefs: BreathePreferences): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch { /* ignore */ }
}

export function setBreatheMuted(muted: boolean): BreathePreferences {
  const next = { ...loadBreathePreferences(), muted };
  saveBreathePreferences(next);
  return next;
}

export function setSoundscapeOverride(
  anchorId: string,
  soundscape: Soundscape,
): BreathePreferences {
  const prefs = loadBreathePreferences();
  const next = {
    ...prefs,
    soundscapeOverrides: { ...prefs.soundscapeOverrides, [anchorId]: soundscape },
  };
  saveBreathePreferences(next);
  return next;
}

export function getSoundscapeOverride(anchorId: string): Soundscape | undefined {
  return loadBreathePreferences().soundscapeOverrides[anchorId];
}
