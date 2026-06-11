/**
 * device-contacts.ts
 *
 * Wrapper around @capacitor-community/contacts for native iOS/Android only.
 * All functions are no-ops / return safe defaults on web.
 */

import { detectPlatform } from "@/lib/platform";

export interface DeviceContact {
  name: string;
  phones: string[];
}

/** True when running inside the Capacitor native shell (iOS or Android). */
export function isNativePlatform(): boolean {
  const p = detectPlatform();
  return p === "ios" || p === "android";
}

/**
 * Check current contacts permission status without triggering a dialog.
 * Returns "granted", "denied", or "prompt" (not yet asked).
 * Always returns "denied" on web.
 */
export async function getContactsPermissionStatus(): Promise<"granted" | "denied" | "prompt"> {
  if (!isNativePlatform()) return "denied";
  try {
    const { Contacts } = await import("@capacitor-community/contacts");
    const result = await Contacts.checkPermissions();
    const state = result.contacts;
    if (state === "granted") return "granted";
    if (state === "denied") return "denied";
    return "prompt";
  } catch {
    return "denied";
  }
}

/**
 * Request contacts permission from the OS.
 * Shows the native dialog on first call; on subsequent calls returns current state.
 * Returns true if granted.
 */
export async function requestContactsPermission(): Promise<boolean> {
  if (!isNativePlatform()) return false;
  try {
    const { Contacts } = await import("@capacitor-community/contacts");
    const result = await Contacts.requestPermissions();
    return result.contacts === "granted";
  } catch {
    return false;
  }
}

/**
 * Search device contacts by name (case-insensitive partial match).
 * Returns matched contacts with their phone numbers.
 * Returns empty array on web or if permission not granted.
 */
export async function searchContactsByName(name: string): Promise<DeviceContact[]> {
  if (!isNativePlatform()) return [];
  if (!name.trim()) return [];
  try {
    const { Contacts } = await import("@capacitor-community/contacts");
    const result = await Contacts.getContacts({
      projection: {
        name: true,
        phones: true,
      },
    });

    const query = name.trim().toLowerCase();
    const matches: DeviceContact[] = [];

    for (const contact of result.contacts) {
      const fullName =
        [contact.name?.given, contact.name?.family].filter(Boolean).join(" ").trim() ||
        contact.name?.display ||
        "";

      if (!fullName) continue;
      if (!fullName.toLowerCase().includes(query)) continue;

      const phones = (contact.phones ?? [])
        .map((p) => p.number ?? "")
        .filter(Boolean);

      if (phones.length === 0) continue;

      matches.push({ name: fullName, phones });
    }

    return matches.slice(0, 5);
  } catch {
    return [];
  }
}
