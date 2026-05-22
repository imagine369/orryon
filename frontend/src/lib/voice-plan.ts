/** Voice access by subscription plan — keep in sync with backend/deps.py */

export type VoicePlan = string | undefined | null;

const VOICE_INPUT_PLANS = new Set(["trial", "pro", "premium", "premium_plus"]);

/** Speak to Orryon (STT / chat mic). Trial = capped; paid tiers = monthly pool. */
export function planAllowsVoiceInput(plan: VoicePlan): boolean {
  return !!plan && VOICE_INPUT_PLANS.has(plan);
}

/** Hear Orryon read replies (TTS) — Premium Plus only, when overlay toggle is on */
export function planAllowsVoiceOutput(plan: VoicePlan, overlayEnabled: boolean): boolean {
  return plan === "premium_plus" && overlayEnabled;
}

/** Floating Live Orryon companion — Premium tiers */
export function planAllowsLiveOrryon(plan: VoicePlan): boolean {
  return plan === "premium" || plan === "premium_plus";
}

/** Show speaker toggle in chat */
export function planShowsSpeakResponsesToggle(plan: VoicePlan): boolean {
  return plan === "premium_plus";
}

/** Settings voice usage meter */
export function planShowsVoiceUsage(plan: VoicePlan): boolean {
  return planAllowsVoiceInput(plan);
}
