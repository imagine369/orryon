/**
 * Orryon voice configuration.
 *
 * Single source of truth for the voice ID and mode-specific prosody shaping.
 * If we change voices or tune the breathing cadence, this is the only file
 * the frontend needs to touch.
 *
 * See `docs/voice-direction.md` for the casting brief this implements.
 *
 * xAI ships five voices: ara, eve, leo, rex, sal. We picked `sal` because
 * "smooth, balanced, versatile" maps cleanly onto the brief: warm enough for
 * breathing guidance, grounded enough for finance. `leo` is too commanding
 * and `rex` too corporate.
 */

/** xAI TTS voice ID for Orryon. */
export const ORRYON_VOICE_ID = "sal" as const;

/** BCP-47 language code. English only for now; the model supports 20+. */
export const ORRYON_VOICE_LANGUAGE = "en" as const;

/**
 * Delivery mode for a given utterance.
 * - `chat`: normal assistant replies (budgeting, tips, celebrations).
 *   Natural pace, no wrapping tags. The voice does the work.
 * - `breathing`: guided-breath prompts. Wrapped in `<slow>` with a `[pause]`
 *   inserted at sentence boundaries so counts land at the pace of a real breath.
 */
export type VoiceMode = "chat" | "breathing";

/**
 * Apply mode-specific prosody tags to text before sending to xAI TTS.
 *
 * Kept deliberately conservative — the brief warns explicitly against
 * theatrical or over-shaped delivery. We lean on the voice's natural warmth
 * and only intervene where silence genuinely matters (breathing counts).
 */
export function shapeForVoice(text: string, mode: VoiceMode = "chat"): string {
  const clean = text.trim();
  if (!clean) return clean;

  if (mode === "chat") {
    return clean;
  }

  // Breathing mode: insert a brief pause after each sentence/clause so the
  // user has space to actually inhale or exhale, then wrap the whole thing
  // in <slow> for a noticeably calmer pace.
  const withPauses = clean
    .replace(/([.!?])(\s+)/g, "$1 [pause] ")
    .replace(/,(\s+)/g, ", [pause] ");

  return `<slow>${withPauses}</slow>`;
}
