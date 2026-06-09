import type { View } from "./types";

export function parentOf(view: View): View {
  if (view === "security" || view === "sessions" || view === "connected")
    return "security-access";
  if (view === "data") return "privacy-safety";
  return null;
}

export function formatAccountDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export function ageFromBirthDate(iso: string): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const birth = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDelta = today.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age >= 0 && age < 150 ? age : null;
}

export { isDemoMode as isDemo } from "@/lib/demo-mode";
