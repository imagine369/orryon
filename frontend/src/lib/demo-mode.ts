/** Demo / preview mode — localhost only; never active on the live site. */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function isLocalHostClient(): boolean {
  if (typeof window === "undefined") return false;
  return LOCAL_HOSTS.has(window.location.hostname);
}

/** Drop stale demo flag when visiting production (e.g. copied localStorage). */
export function clearDemoFlagIfRemote(): void {
  if (typeof window === "undefined" || isLocalHostClient()) return;
  try {
    localStorage.removeItem("orryon_demo");
  } catch {
    /* ignore */
  }
}

export function isDemoMode(): boolean {
  if (!isLocalHostClient()) return false;
  try {
    return localStorage.getItem("orryon_demo") === "true";
  } catch {
    return false;
  }
}

/** Alias used by dashboard components. */
export const isDemo = isDemoMode;
