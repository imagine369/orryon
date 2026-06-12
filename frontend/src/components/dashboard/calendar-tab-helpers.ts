import { ApiError } from "@/lib/api";

interface CalEventLike {
  id: string;
  event_date: string;
}

const CALENDAR_UPGRADE_MSG =
  "Calendar changes require an active Pro, Premium, or Premium Plus plan. Upgrade to save events.";

/** Map API failures to user-facing calendar CRUD messages. */
export function calendarCrudErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.status === 403) {
      return err.message.trim() || CALENDAR_UPGRADE_MSG;
    }
    if (err.message.trim()) return err.message;
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}

/** Parse stored event_date values (YYYY-MM-DD, YYYY-MM-DD HH:MM, or ISO with T). */
export function parseEventDate(eventDate: string): { date: string; time: string; allDay: boolean } {
  const normalized = eventDate.trim().replace("T", " ");
  const date = normalized.slice(0, 10);
  const timePart = normalized.length > 10 ? normalized.slice(11, 16) : "";
  const time = /^\d{2}:\d{2}$/.test(timePart) ? timePart : "";
  return { date, time, allDay: !time };
}

export function eventDateKey(eventDate: string): string {
  return parseEventDate(eventDate).date;
}

export function fmtEventTime(eventDate: string): string | null {
  const { time, allDay } = parseEventDate(eventDate);
  if (allDay || !time) return null;
  const [h, m] = time.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function monthRange(year: number, month: number) {
  const m = String(month + 1).padStart(2, "0");
  const lastDay = new Date(year, month + 1, 0).getDate();
  return {
    from: `${year}-${m}-01`,
    to: `${year}-${m}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function eventsInMonth<T extends CalEventLike>(events: T[], year: number, month: number) {
  const { from, to } = monthRange(year, month);
  return events.filter((e) => {
    const ds = eventDateKey(e.event_date);
    return ds >= from && ds <= to;
  });
}

/** Keep in-flight tmp-* creates visible when a silent reload runs before POST completes. */
export function mergeEventsWithPendingOptimistic<T extends CalEventLike>(
  fromApi: T[],
  prev: T[],
): T[] {
  const pending = prev.filter((row) => row.id.startsWith("tmp-"));
  if (pending.length === 0) return fromApi;
  const merged = [...fromApi];
  for (const row of pending) {
    if (!merged.some((r) => r.id === row.id)) merged.push(row);
  }
  return merged;
}
