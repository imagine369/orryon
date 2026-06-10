/** Display label for a list row; appends notes (e.g. quantity) when present. */
export function listItemLabel(name: string, notes?: string | null): string {
  const label = String(name ?? "").trim();
  const extra = String(notes ?? "").trim();
  return extra ? `${label} (${extra})` : label;
}

/** Case-insensitive match against item name, notes, or combined label. */
export function listItemMatchesQuery(
  item: { name: string; notes?: string | null },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    item.name,
    item.notes ?? "",
    listItemLabel(item.name, item.notes),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}
