/** PWA cache-bust migration keys — batched into a single reload in SwBuildSync. */
export const PWA_UI_MIGRATION_KEYS = [
  "orryon_floating_buddy_removed_v1",
  "orryon_single_chat_avatar_v1",
] as const;

export const LS_CANARY_KEY = "orryon_build_canary";

/** Keys that still need a one-time cache bust (read-only; does not mutate storage). */
export function pendingPwaMigrations(
  keys: readonly string[],
  storage: Pick<Storage, "getItem">,
): string[] {
  return keys.filter((key) => !storage.getItem(key));
}
