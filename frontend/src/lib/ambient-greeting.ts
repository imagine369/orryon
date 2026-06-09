/** Premium wake-up spoken greetings (via /api/voice/tts). */

const PRIMARY_GREETING = "There you are. What can I do?";
const VARIANT_GREETING = "There you are… What can I do for you?";

/** ~25% chance of the longer variant for a natural, warm feel. */
export function pickAmbientGreeting(random = Math.random()): string {
  return random < 0.25 ? VARIANT_GREETING : PRIMARY_GREETING;
}

export const AMBIENT_GREETING_PRIMARY = PRIMARY_GREETING;
export const AMBIENT_GREETING_VARIANT = VARIANT_GREETING;
