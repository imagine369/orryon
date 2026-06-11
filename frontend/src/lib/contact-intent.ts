/**
 * contact-intent.ts
 *
 * Detects contact-lookup intent in a user message and builds a context
 * block to append silently before sending to the backend.
 */

import type { DeviceContact } from "@/lib/device-contacts";

/**
 * Patterns that indicate the user wants to call/reach/text a person.
 * Captures the name after the keyword.
 */
const CONTACT_INTENT_PATTERNS = [
  /\bcall\s+([a-z][a-z\s'-]{1,40}?)(?:\s*[?.!]|$)/i,
  /\btext\s+([a-z][a-z\s'-]{1,40}?)(?:\s*[?.!]|$)/i,
  /\bdial\s+([a-z][a-z\s'-]{1,40}?)(?:\s*[?.!]|$)/i,
  /\breach\s+([a-z][a-z\s'-]{1,40}?)(?:\s*[?.!]|$)/i,
  /\bphone\s+(?:number\s+(?:for|of)\s+)?([a-z][a-z\s'-]{1,40}?)(?:\s*[?.!]|$)/i,
  /\bnumber\s+(?:for|of)\s+([a-z][a-z\s'-]{1,40}?)(?:\s*[?.!]|$)/i,
  /\b([a-z][a-z\s'-]{1,40}?)'s\s+(?:phone\s+)?number\b/i,
  /\bcontact\s+(?:info(?:rmation)?\s+for\s+)?([a-z][a-z\s'-]{1,40}?)(?:\s*[?.!]|$)/i,
];

/**
 * Extracts the name of the person the user wants to contact.
 * Returns null if no contact intent is detected.
 */
export function extractContactName(message: string): string | null {
  for (const pattern of CONTACT_INTENT_PATTERNS) {
    const match = message.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return null;
}

/**
 * Builds the hidden context block appended to the message.
 * The user never sees this — it only goes to the backend.
 */
export function buildContactsContext(
  name: string,
  matches: DeviceContact[],
): string {
  if (matches.length === 0) return "";

  const entries = matches
    .map((c) => {
      const phones = c.phones.join(", ");
      return `${c.name}: ${phones}`;
    })
    .join(" | ");

  return `\n\n[Device contacts matching "${name}": ${entries}]`;
}
