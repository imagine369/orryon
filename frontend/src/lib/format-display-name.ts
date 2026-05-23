/** Trim and capitalize the first letter for greetings and UI (e.g. sato → Sato). */
export function formatDisplayName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toLocaleUpperCase() + trimmed.slice(1);
}
