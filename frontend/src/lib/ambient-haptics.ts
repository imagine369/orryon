/**
 * Wake / sleep haptics for Smart Ambient Pickup.
 *
 * Uses @capacitor/haptics on native shells (incl. iOS) with navigator.vibrate
 * fallback — mirrors the pattern in breathing-sounds.ts.
 */

import { triggerHaptics } from "@/lib/breathing-sounds";

/** Gentle bloom / heartbeat on wake-up. */
export const AMBIENT_WAKE_HAPTIC_PATTERN = [45, 55, 45, 70, 40] as const;

/** Soft settling pulse when Orryon goes to sleep. */
export const AMBIENT_SLEEP_HAPTIC_PATTERN = [35, 50, 30] as const;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function triggerCapacitorWakeBloom(): Promise<boolean> {
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Light });
    await delay(55);
    await Haptics.impact({ style: ImpactStyle.Medium });
    await delay(70);
    await Haptics.impact({ style: ImpactStyle.Light });
    return true;
  } catch {
    return false;
  }
}

async function triggerCapacitorSleepPulse(): Promise<boolean> {
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Light });
    await delay(50);
    await Haptics.impact({ style: ImpactStyle.Light });
    return true;
  } catch {
    return false;
  }
}

/** Soft bloom / heartbeat when Orryon wakes on pickup. */
export async function triggerAmbientWakeHaptics(): Promise<void> {
  const usedNative = await triggerCapacitorWakeBloom();
  if (!usedNative) {
    triggerHaptics([...AMBIENT_WAKE_HAPTIC_PATTERN]);
  }
}

/** Gentle settling pulse when Orryon returns to sleep. */
export async function triggerAmbientSleepHaptics(): Promise<void> {
  const usedNative = await triggerCapacitorSleepPulse();
  if (!usedNative) {
    triggerHaptics([...AMBIENT_SLEEP_HAPTIC_PATTERN]);
  }
}
