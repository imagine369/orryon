export const PRIORITY_CONFIG = {
  high: { label: "P1", color: "#db4035", next: "medium" as const },
  medium: { label: "P2", color: "#ff9a14", next: "low" as const },
  low: { label: "P3", color: "#4073ff", next: "none" as const },
  none: { label: "P4", color: "#555555", next: "high" as const },
} as const;

export type PriorityKey = keyof typeof PRIORITY_CONFIG;

export function priorityBorderColor(priority: string) {
  return PRIORITY_CONFIG[priority as PriorityKey]?.color ?? PRIORITY_CONFIG.none.color;
}

export type TaskSort = "priority" | "date" | "name" | "manual";

export const PRIORITY_ORDER: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
  none: 3,
};

export function isDemo() {
  return typeof window !== "undefined" && localStorage.getItem("orryon_demo") === "true";
}

export const TODAY = new Date().toISOString().split("T")[0];

export interface Task {
  id: string;
  title: string;
  priority: string;
  due_date: string;
  status: string;
  sort_order?: number;
}

export interface Event {
  id: string;
  title: string;
  event_date: string;
  event_type: string;
}

export interface Bill {
  id: string;
  name: string;
  amount: number;
  frequency: string;
  next_due: string;
}

export const DEMO_TASKS: Task[] = [
  { id: "dt1", title: "Review Q2 budget report", priority: "high", due_date: TODAY, status: "open" },
  { id: "dt2", title: "Call with accountant at 3pm", priority: "high", due_date: TODAY, status: "open" },
  { id: "dt3", title: "Send weekly update to team", priority: "medium", due_date: TODAY, status: "open" },
  { id: "dt4", title: "Book flight to NYC", priority: "medium", due_date: TODAY, status: "open" },
  { id: "dt5", title: "Review gym membership renewal", priority: "low", due_date: TODAY, status: "open" },
  { id: "dt6", title: "Pick up dry cleaning", priority: "none", due_date: TODAY, status: "open" },
];

export const DEMO_EVENTS: Event[] = [
  { id: "de1", title: "Team standup", event_date: `${TODAY}T09:00:00Z`, event_type: "meeting" },
  { id: "de2", title: "Lunch with Sarah", event_date: `${TODAY}T12:30:00Z`, event_type: "personal" },
  { id: "de3", title: "Dentist appointment", event_date: `${TODAY}T15:00:00Z`, event_type: "appointment" },
];

export const DEMO_BILLS: Bill[] = [
  { id: "db1", name: "Netflix", amount: 15.99, frequency: "monthly", next_due: TODAY },
  { id: "db2", name: "Spotify", amount: 9.99, frequency: "monthly", next_due: TODAY },
];

export type Tab = "today" | "calendar" | "lists";
