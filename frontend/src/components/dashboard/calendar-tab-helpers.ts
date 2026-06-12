interface CalEventLike {
  id: string;
  event_date: string;
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
    const ds = e.event_date.slice(0, 10);
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
