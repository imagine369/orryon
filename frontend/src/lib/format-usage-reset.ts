/** Format billing/trial reset line in the user's local timezone. */
export function formatUsageResetLabel(resetDateIso: string, isTrialPeriod?: boolean): string {
  const end = new Date(resetDateIso);
  if (Number.isNaN(end.getTime())) return "";
  const now = new Date();
  const days = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86400000));
  const date = end.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const prefix = isTrialPeriod ? "Trial ends" : "Resets";
  return days > 0
    ? `${prefix} ${date} (${days} day${days !== 1 ? "s" : ""})`
    : `${prefix} ${date}`;
}
