/**
 * Orryon voice configuration.
 *
 * Single source of truth for voice IDs and mode-specific prosody shaping.
 *
 * Two providers:
 *   xAI  — chat assistant replies (sal: smooth, balanced, versatile)
 *   ElevenLabs — orb / breathing cues (Erin - Meditation Guide:
 *                soft, peaceful, purpose-built female meditation voice)
 *
 * The orb calls /api/voice/orb-tts, which proxies to ElevenLabs when
 * ELEVENLABS_API_KEY is set, and falls back to xAI `eve` otherwise.
 */

/** xAI TTS voice ID — used for chat assistant replies. */
export const ORRYON_VOICE_ID = "sal" as const;

/**
 * ElevenLabs voice ID for the orb / breathing cues.
 * "Erin - Meditation Guide" — gentle, peaceful, female.
 * Sent to /api/voice/orb-tts (not /api/voice/tts).
 */
export const ORB_VOICE_ID = "DKfKzHbGIi7qsCsZWN8G" as const;

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
    // Punctuation drives the pauses — the model already breathes at periods.
    return `<slow>${clean}</slow>`;
  }

  // Anchor mode — slow, spacious, meditative.
  // [pause] = short beat. [long-pause] = Tolle-length silence between thoughts.
  // One per sentence boundary — stacking them causes them to be spoken literally.
  const shaped = clean
    // Long silence after each sentence
    .replace(/([.!?])\s+/g, "$1 [long-pause] ")
    .replace(/([.!?])$/, "$1 [long-pause]")
    // Short beat after comma or dash
    .replace(/,\s+/g, ", [pause] ")
    .replace(/—/g, " [pause] ");

  return `<slow>${shaped}</slow>`;
}
