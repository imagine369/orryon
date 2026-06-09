/** Avatar lifecycle for Smart Ambient Pickup (distinct from chat voice alive states). */

export type AmbientAvatarState =
  | "sleeping"
  | "awakening"
  | "active"
  | "miniOrb";

export const AMBIENT_AWAKE_STATES = new Set<AmbientAvatarState>([
  "awakening",
  "active",
  "miniOrb",
]);

export function isAmbientAwake(state: AmbientAvatarState): boolean {
  return AMBIENT_AWAKE_STATES.has(state);
}

/** Valid state-machine transitions for AmbientOrryonService. */
export function canTransitionAmbientState(
  from: AmbientAvatarState,
  to: AmbientAvatarState,
): boolean {
  if (from === to) return true;
  switch (from) {
    case "sleeping":
      return to === "awakening";
    case "awakening":
      return to === "active" || to === "sleeping";
    case "active":
      return to === "miniOrb" || to === "sleeping";
    case "miniOrb":
      return to === "active" || to === "sleeping";
    default:
      return false;
  }
}
