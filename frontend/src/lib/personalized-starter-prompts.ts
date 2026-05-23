/**
 * v1 home shortcuts: onboarding picks (cold start) + what the user asks about most.
 * Usage scores can outweigh declared priorities over time.
 */

const DECLARED_PRIORITY_BOOST = 2;

export type StarterPrompt = { label: string; message: string };

export type StarterTopicId =
  | "finance"
  | "calendar"
  | "communication"
  | "planning"
  | "notes"
  | "tasks"
  | "wellness"
  | "health"
  | "goals"
  | "general";

type StarterTopic = {
  id: StarterTopicId;
  keywords: string[];
  prompts: StarterPrompt[];
};

/** Shown when we have no signal yet — broad, not finance-specific. */
export const DEFAULT_STARTER_PROMPTS: StarterPrompt[] = [
  { label: "This week", message: "What's on my calendar this week?" },
  { label: "Catch me up", message: "Give me a quick briefing on what's important for me right now." },
  { label: "Draft help", message: "Help me draft a short message — I'll tell you the context." },
  { label: "Plan ahead", message: "Help me plan the next few days." },
];

const STARTER_TOPICS: StarterTopic[] = [
  {
    id: "health",
    keywords: [
      "medication", "medicine", "pill", "dose", "doctor", "appointment",
      "blood pressure", "vitals", "pharmacy", "health", "symptom", "nurse",
    ],
    prompts: [
      { label: "My medications", message: "What medications am I taking?" },
      { label: "Health visit", message: "When is my next doctor appointment?" },
      { label: "Health check-in", message: "Help me with a quick health check-in." },
    ],
  },
  {
    id: "finance",
    keywords: [
      "spent", "spend", "budget", "transaction", "expense", "receipt", "income",
      "savings", "money", "dollar", "payment", "bill", "subscription", "lunch",
      "dinner", "coffee", "purchase", "net worth", "finance",
    ],
    prompts: [
      { label: "Log spending", message: "I just spent $12 on coffee — log it for me." },
      { label: "This month", message: "How am I doing on spending this month?" },
      { label: "Recent purchases", message: "What have I spent on lately?" },
    ],
  },
  {
    id: "calendar",
    keywords: [
      "calendar", "schedule", "meeting", "event", "appointment", "reminder",
      "week", "tomorrow", "today", "busy", "free time",
    ],
    prompts: [
      { label: "This week", message: "What's on my calendar this week?" },
      { label: "Tomorrow", message: "What do I have tomorrow?" },
      { label: "Find time", message: "When am I free this week for something important?" },
    ],
  },
  {
    id: "communication",
    keywords: [
      "email", "message", "text", "reply", "draft", "polite", "tone", "sound",
      "wording", "follow up", "apologize", "thank you",
    ],
    prompts: [
      { label: "Sound okay?", message: "Does this message sound polite? I'll paste it next." },
      { label: "Draft reply", message: "Help me draft a reply — I'll share the thread." },
      { label: "Soften tone", message: "Make this message warmer without changing the meaning." },
    ],
  },
  {
    id: "planning",
    keywords: [
      "plan", "weekend", "saturday", "sunday", "trip", "travel", "itinerary",
      "prepare", "organize", "next few days",
    ],
    prompts: [
      { label: "Plan weekend", message: "Help me plan a calm weekend." },
      { label: "Plan ahead", message: "Help me plan the next few days." },
      { label: "Trip ideas", message: "Help me think through a short trip I'm considering." },
    ],
  },
  {
    id: "notes",
    keywords: ["note", "notes", "journal", "write down", "remember", "capture"],
    prompts: [
      { label: "Save a note", message: "Save this as a note for me:" },
      { label: "Find note", message: "What notes do I have about this topic?" },
      { label: "Summarize notes", message: "Summarize my recent notes on one theme." },
    ],
  },
  {
    id: "tasks",
    keywords: [
      "todo", "to-do", "task", "action item", "grocery", "list", "errand",
      "chore", "remind me to",
    ],
    prompts: [
      { label: "My tasks", message: "What tasks or action items are still open?" },
      { label: "Add task", message: "Add a task for me:" },
      { label: "Grocery list", message: "What's on my grocery list?" },
    ],
  },
  {
    id: "wellness",
    keywords: [
      "breathe", "breath", "meditat", "stress", "anxious", "calm", "sleep",
      "tired", "overwhelmed", "mindful",
    ],
    prompts: [
      { label: "Take a breath", message: "Guide me through a short breathing exercise." },
      { label: "Unwind", message: "Help me unwind after a long day." },
      { label: "Quick reset", message: "I need a one-minute mental reset." },
    ],
  },
  {
    id: "goals",
    keywords: ["goal", "habit", "streak", "progress", "milestone", "target"],
    prompts: [
      { label: "My goals", message: "How am I doing on my goals?" },
      { label: "Check in", message: "Help me check in on a goal I'm working on." },
      { label: "Next step", message: "What's a sensible next step on my main goal?" },
    ],
  },
  {
    id: "general",
    keywords: ["help", "what can", "how do i", "explain", "summarize", "briefing"],
    prompts: [
      { label: "Catch me up", message: "Give me a quick briefing on what's important for me right now." },
      { label: "What can you do?", message: "What are the most useful things you can do for my life data?" },
      { label: "Quick summary", message: "Summarize what's going on in my life OS this week." },
    ],
  },
];

const TOPIC_BY_ID = Object.fromEntries(
  STARTER_TOPICS.map((t) => [t.id, t]),
) as Record<StarterTopicId, StarterTopic>;

function scoreTopicText(topic: StarterTopic, text: string): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const kw of topic.keywords) {
    const needle = kw.toLowerCase();
    let idx = 0;
    while (true) {
      const at = lower.indexOf(needle, idx);
      if (at === -1) break;
      score += 1;
      idx = at + needle.length;
    }
  }
  return score;
}

/** Usage signal: recent user messages count more than older ones. */
function scoreTopicsFromMessages(userMessages: string[]): Map<StarterTopicId, number> {
  const scores = new Map<StarterTopicId, number>();
  const n = userMessages.length;
  for (const topic of STARTER_TOPICS) {
    scores.set(topic.id, 0);
  }
  userMessages.forEach((msg, i) => {
    const recency = n <= 1 ? 1 : 0.5 + (0.5 * i) / (n - 1);
    for (const topic of STARTER_TOPICS) {
      const hits = scoreTopicText(topic, msg);
      if (hits > 0) {
        const prev = scores.get(topic.id) ?? 0;
        scores.set(topic.id, prev + hits * recency + recency);
      }
    }
  });
  return scores;
}

function pickPromptForTopic(topic: StarterTopic, seed: number): StarterPrompt {
  const prompts = topic.prompts;
  return prompts[seed % prompts.length] ?? prompts[0];
}

/**
 * Pick up to `count` starter chips from user messages and memory facts.
 * Topics with no signal are skipped; defaults fill remaining slots.
 */
export function pickPersonalizedStarterPrompts(
  userMessages: string[],
  memoryFacts: string[] = [],
  count = 4,
  declaredPriorities: StarterTopicId[] = [],
): StarterPrompt[] {
  const corpus = [...userMessages, ...memoryFacts].join("\n").trim();
  const usageScores = scoreTopicsFromMessages(userMessages);

  for (const fact of memoryFacts) {
    for (const topic of STARTER_TOPICS) {
      const hits = scoreTopicText(topic, fact);
      if (hits > 0) {
        usageScores.set(topic.id, (usageScores.get(topic.id) ?? 0) + hits * 0.25);
      }
    }
  }

  for (const id of declaredPriorities) {
    if (TOPIC_BY_ID[id]) {
      usageScores.set(id, (usageScores.get(id) ?? 0) + DECLARED_PRIORITY_BOOST);
    }
  }

  const hasUsage = [...usageScores.values()].some((s) => s > 0);

  if (!corpus && !hasUsage && declaredPriorities.length > 0) {
    const chosen: StarterPrompt[] = [];
    const usedLabels = new Set<string>();
    let seed = 0;
    for (const id of declaredPriorities) {
      if (chosen.length >= count) break;
      const topic = TOPIC_BY_ID[id];
      if (!topic) continue;
      const prompt = pickPromptForTopic(topic, seed++);
      if (usedLabels.has(prompt.label)) continue;
      usedLabels.add(prompt.label);
      chosen.push(prompt);
    }
    for (const fallback of DEFAULT_STARTER_PROMPTS) {
      if (chosen.length >= count) break;
      if (usedLabels.has(fallback.label)) continue;
      usedLabels.add(fallback.label);
      chosen.push(fallback);
    }
    return chosen.slice(0, count);
  }

  if (!corpus && !hasUsage) {
    return DEFAULT_STARTER_PROMPTS.slice(0, count);
  }

  const ranked = STARTER_TOPICS.map((topic) => ({
    topic,
    score: usageScores.get(topic.id) ?? 0,
  }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  const chosen: StarterPrompt[] = [];
  const usedLabels = new Set<string>();
  let seed = corpus.length;

  for (const { topic } of ranked) {
    if (chosen.length >= count) break;
    const prompt = pickPromptForTopic(topic, seed++);
    if (usedLabels.has(prompt.label)) continue;
    usedLabels.add(prompt.label);
    chosen.push(prompt);
  }

  for (const fallback of DEFAULT_STARTER_PROMPTS) {
    if (chosen.length >= count) break;
    if (usedLabels.has(fallback.label)) continue;
    usedLabels.add(fallback.label);
    chosen.push(fallback);
  }

  return chosen.slice(0, count);
}

/** @internal exported for tests */
export function getStarterTopic(id: StarterTopicId): StarterTopic | undefined {
  return TOPIC_BY_ID[id];
}
