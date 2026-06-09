/**
 * Orchestrates the ambient wake-up and sleep sequences (Phase 3):
 * haptics + SFX + optional Premium spoken greeting via TTS.
 */

import { playAmbientSettleSound, playAmbientWakeSound } from "@/lib/ambient-audio";
import { pickAmbientGreeting } from "@/lib/ambient-greeting";
import {
  triggerAmbientSleepHaptics,
  triggerAmbientWakeHaptics,
} from "@/lib/ambient-haptics";
import type { AmbientSoundStyle } from "@/lib/ambient-plan";
import { textToSpeech } from "@/lib/voice";

export interface AmbientWakeOptions {
  premiumGreeting: boolean;
  soundStyle: AmbientSoundStyle;
}

/** Wake on pickup: bloom haptics, SFX, and Premium TTS greeting when eligible. */
export async function playAmbientWakeSequence(
  options: AmbientWakeOptions,
): Promise<void> {
  void triggerAmbientWakeHaptics();
  playAmbientWakeSound(options.soundStyle);

  if (options.premiumGreeting) {
    await textToSpeech(pickAmbientGreeting());
  }
}

/** Graceful sleep: settling haptics + soft chime. */
export async function playAmbientSleepSequence(): Promise<void> {
  void triggerAmbientSleepHaptics();
  playAmbientSettleSound();
}
