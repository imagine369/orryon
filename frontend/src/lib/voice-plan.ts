/** Voice access by subscription plan — keep in sync with backend/deps.py */

export type VoicePlan = string | undefined | null;

/** Speak to Orryon (STT / mic) — Premium + Premium Plus only */
export function planAllowsVoiceInput(plan: VoicePlan, billingEnabled = true): boolean {
  if (!billingEnabled) return true;
  return plan === "premium" || plan === "premium_plus";
}

/** Hear Orryon read replies (TTS) — Premium Plus only, when overlay toggle is on */
export function planAllowsVoiceOutput(
  plan: VoicePlan,
  overlayEnabled: boolean,
  billingEnabled = true,
): boolean {
  if (!billingEnabled) return overlayEnabled;
  return plan === "premium_plus" && overlayEnabled;
}

/** Show speaker toggle in chat */
export function planShowsSpeakResponsesToggle(plan: VoicePlan, billingEnabled = true): boolean {
  if (!billingEnabled) return true;
  return plan === "premium_plus";
}

/** Settings voice usage meter */
export function planShowsVoiceUsage(plan: VoicePlan, billingEnabled = true): boolean {
  return planAllowsVoiceInput(plan, billingEnabled);
}
