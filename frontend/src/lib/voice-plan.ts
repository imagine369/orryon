/** Voice access by subscription plan — keep in sync with backend/deps.py */

export type VoicePlan = string | undefined | null;

/** Speak to Orryon (STT / mic) — Premium + Premium Plus only */
export function planAllowsVoiceInput(plan: VoicePlan): boolean {
  return plan === "premium" || plan === "premium_plus";
}

/** Hear Orryon read replies (TTS) — Premium Plus only, when overlay toggle is on */
export function planAllowsVoiceOutput(plan: VoicePlan, overlayEnabled: boolean): boolean {
  return plan === "premium_plus" && overlayEnabled;
}

/** Show speaker toggle in chat */
export function planShowsSpeakResponsesToggle(plan: VoicePlan): boolean {
  return plan === "premium_plus";
}

/** Settings voice usage meter */
export function planShowsVoiceUsage(plan: VoicePlan): boolean {
  return planAllowsVoiceInput(plan);
}
