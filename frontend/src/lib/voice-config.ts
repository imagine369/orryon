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

/** xAI TTS voice ID for Orryon — the assistant's chat voice. */
export const ORRYON_VOICE_ID = "sal" as const;

/**
 * Orb voice — used exclusively for breathing and Reset Anchor sessions.
 * Separate from Orryon so they feel like two distinct presences:
 * Orryon speaks, Orb guides.
 * `ara` is female, warm, and measured — closest xAI voice to the
 * calm, unhurried presence we're after.
 */
export const ORB_VOICE_ID = "ara" as const;

/** BCP-47 language code. English only for now; the model supports 20+. */
export const ORRYON_VOICE_LANGUAGE = "en" as const;

/**
 * Delivery mode for a given utterance.
 * - `chat`: normal assistant replies. Natural pace, no wrapping tags.
 * - `breathing`: guided-breath prompts. Wrapped in `<slow>` with pauses at
 *   sentence boundaries so counts land at the pace of a real breath.
 * - `anchor`: reset anchor session cues. Maximum stillness — very slow,
 *   double pauses between phrases, silence after each sentence. Designed
 *   for eyes-closed, Tolle-paced delivery.
 */
export type VoiceMode = "chat" | "breathing" | "anchor";

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

  if (mode === "breathing") {
    // Brief pause after each sentence/clause so counts land at breath pace.
    const withPauses = clean
      .replace(/([.!?])(\s+)/g, "$1 [pause] ")
      .replace(/,(\s+)/g, ", [pause] ");
    return `<slow>${withPauses}</slow>`;
  }

  // Anchor mode: maximum stillness. Double pauses after every sentence,
  // single pause after every clause. The silence is the instruction.
  const withPauses = clean
    .replace(/([.!?])(\s+|$)/g, "$1 [pause] [pause] ")
    .replace(/,(\s+)/g, ", [pause] ")
    .replace(/—/g, " [pause] ")
    .replace(/\.\.\./g, " [pause] [pause] ");

  return `<slow>${withPauses}</slow>`;
}
