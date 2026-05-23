import type { StarterTopicId } from "@/lib/personalized-starter-prompts";

/** Onboarding / settings: what the user wants Orryon to focus on (max 3). */
export type LifePriorityId = Extract<
  StarterTopicId,
  "health" | "calendar" | "communication" | "finance" | "tasks" | "notes"
>;

export const MAX_LIFE_PRIORITIES = 3;

export const LIFE_PRIORITY_OPTIONS: {
  id: LifePriorityId;
  label: string;
  description: string;
}[] = [
  {
    id: "health",
    label: "Health & medications",
    description: "Appointments, meds, and wellness check-ins",
  },
  {
    id: "calendar",
    label: "Schedule",
    description: "Calendar, meetings, and what's coming up",
  },
  {
    id: "communication",
    label: "Family & messages",
    description: "Drafting replies and staying in touch",
  },
  {
    id: "finance",
    label: "Money & bills",
    description: "Spending, budgets, and subscriptions",
  },
  {
    id: "tasks",
    label: "Tasks & reminders",
    description: "To-dos, errands, and grocery lists",
  },
  {
    id: "notes",
    label: "Notes & remembering",
    description: "Capture and find what matters",
  },
];

const VALID_IDS = new Set(LIFE_PRIORITY_OPTIONS.map((o) => o.id));

export function parseLifePriorities(
  raw: string | string[] | null | undefined,
): LifePriorityId[] {
  const parts = Array.isArray(raw)
    ? raw
    : (raw ?? "").split(",");
  const out: LifePriorityId[] = [];
  for (const p of parts) {
    const id = p.trim() as LifePriorityId;
    if (VALID_IDS.has(id) && !out.includes(id)) out.push(id);
    if (out.length >= MAX_LIFE_PRIORITIES) break;
  }
  return out;
}

export function serializeLifePriorities(ids: LifePriorityId[]): string {
  return ids.filter((id) => VALID_IDS.has(id)).slice(0, MAX_LIFE_PRIORITIES).join(",");
}

export function lifePriorityLabels(ids: LifePriorityId[]): string {
  return ids
    .map((id) => LIFE_PRIORITY_OPTIONS.find((o) => o.id === id)?.label ?? id)
    .join(", ");
}
