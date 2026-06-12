/** PWA cache-bust migration keys — batched into a single reload in SwBuildSync. */
export const PWA_UI_MIGRATION_KEYS = [
  "orryon_floating_buddy_removed_v1",
  "orryon_single_chat_avatar_v1",
] as const;

export const LS_CANARY_KEY = "orryon_build_canary";
export const CACHE_BUST_FLAG = "orryon_cache_bust_in_progress";

/** How often to poll for a new deploy while the app is open. */
export const BUILD_CHECK_INTERVAL_MS = 5 * 60 * 1000;

/** Wait for idle input before reloading during an active session. */
export const IDLE_BEFORE_RELOAD_MS = 45 * 1000;

/** Keys that still need a one-time cache bust (read-only; does not mutate storage). */
export function pendingPwaMigrations(
  keys: readonly string[],
  storage: Pick<Storage, "getItem">,
): string[] {
  return keys.filter((key) => !storage.getItem(key));
}

/** True when the server reports a newer deploy than the client last applied. */
export function isRemoteBuildNewer(
  storedCanary: string | null,
  remoteCanary: string | null | undefined,
): boolean {
  if (!storedCanary || !remoteCanary) return false;
  return storedCanary !== remoteCanary;
}

/** True when the bundled build differs from what was last applied (fresh open). */
export function isBundledBuildNewer(
  storedCanary: string | null,
  bundledCanary: string,
): boolean {
  return Boolean(storedCanary && storedCanary !== bundledCanary);
}

/**
 * True when this tab should fetch a new deploy. Compares remote to both the
 * in-memory bundle and localStorage so a sibling tab cannot skip reload by
 * updating storage first.
 */
export function needsRemoteBuildUpdate(
  bundledCanary: string,
  storedCanary: string | null,
  remoteCanary: string | null | undefined,
): remoteCanary is string {
  if (!remoteCanary) return false;
  if (bundledCanary !== remoteCanary) return true;
  return isRemoteBuildNewer(storedCanary, remoteCanary);
}

export type ReloadTimingInput = {
  documentHidden: boolean;
  lastActivityAt: number;
  now?: number;
};

/**
 * True when a pending deploy should reload this visible tab after idle time.
 * Returns false while hidden — SwBuildSync reloads on visibilitychange instead.
 */
export function shouldReloadForPendingUpdate({
  documentHidden,
  lastActivityAt,
  now = Date.now(),
}: ReloadTimingInput): boolean {
  if (documentHidden) return false;
  return now - lastActivityAt >= IDLE_BEFORE_RELOAD_MS;
}

export async function fetchRemoteBuildCanary(): Promise<string | null> {
  try {
    const res = await fetch("/api/build", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { canary?: string };
    return typeof data.canary === "string" ? data.canary : null;
  } catch {
    return null;
  }
}
