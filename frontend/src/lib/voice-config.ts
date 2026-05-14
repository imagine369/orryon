/**
 * Orryon voice configuration.
 *
 * Orryon speaks exclusively with xAI `eve` — available on Premium and Premium Plus only.
 * Breathing / Reset Anchor sessions use Web Audio API soundscapes — no TTS.
 */

/** xAI TTS voice ID — used for chat assistant replies only. */
export const ORRYON_VOICE_ID = "eve" as const;

/** BCP-47 language code. */
export const ORRYON_VOICE_LANGUAGE = "en" as const;

/** Delivery mode — only `chat` is active; breathing/anchor use soundscapes. */
export type VoiceMode = "chat";

/** Pass text straight through — no prosody shaping needed for chat. */
export function shapeForVoice(text: string, _mode: VoiceMode = "chat"): string {
  return text.trim();
}
