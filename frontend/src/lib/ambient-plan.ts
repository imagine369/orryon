/** Ambient Mode access by subscription plan — keep in sync with product tier rules. */

import type { VoicePlan } from "@/lib/voice-plan";

export type AmbientSoundStyle = "soft_glow_rise" | "crystal_bloom";

export const AMBIENT_SOUND_STYLES: AmbientSoundStyle[] = [
  "soft_glow_rise",
  "crystal_bloom",
];

/** Premium wake-up: spoken greeting via /api/voice/tts. Free: non-verbal SFX only. */
export function planAllowsAmbientSpokenGreeting(plan: VoicePlan): boolean {
  return plan === "premium" || plan === "premium_plus";
}

/** Put-down hold in mini-orb while user is still talking (VAD). Premium + Premium Plus only. */
export function planAllowsAmbientVoiceHold(plan: VoicePlan): boolean {
  return plan === "premium" || plan === "premium_plus";
}

export function normalizeAmbientSoundStyle(raw: string | undefined | null): AmbientSoundStyle {
  return raw === "crystal_bloom" ? "crystal_bloom" : "soft_glow_rise";
}

export function clampAmbientSensitivity(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}
