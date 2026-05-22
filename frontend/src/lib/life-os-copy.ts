/** Shared Life OS positioning copy (keep in sync with marketing + system prompt). */

export const LIFE_OS_TAGLINE =
  "Your Life OS — ask almost anything; when it's about your life, Orryon does something.";

export const LIFE_OS_SHORT =
  "Ask almost anything. Your money, schedule, and notes actually update when you ask.";

/** Shown on chat empty state — keep in sync with docs/CAPABILITIES.md */
export const LIFE_OS_CHAT_EMPTY =
  "Ask almost anything — spending, calendar, writing, how-tos, or just thinking out loud.";

export const HEALTH_DISCLAIMER_SHORT =
  "Health answers are informational only — not medical advice. Consult a healthcare professional for medical decisions.";

export const CHAT_STARTER_PROMPTS: { label: string; message: string }[] = [
  { label: "Log lunch", message: "I had lunch for $14 at a cafe" },
  { label: "This week", message: "What's on my calendar this week?" },
  { label: "Sound okay?", message: "Does this message sound polite? I'll paste it next." },
  { label: "Plan Saturday", message: "Help me plan a calm Saturday" },
];
