import {
  isAmbientAwake,
  type AmbientAvatarState,
} from "@/lib/ambient-avatar-state";
import type { OrryonAliveState } from "@/lib/orryon-alive-state";

/** Mini floating orb (corner overlay). */
export function shouldShowAmbientMiniOrb(
  ambientEnabled: boolean,
  ambientState: AmbientAvatarState,
  hasMessages: boolean,
): boolean {
  if (!ambientEnabled || !isAmbientAwake(ambientState)) return false;
  if (ambientState === "miniOrb") return true;
  if (hasMessages && (ambientState === "active" || ambientState === "awakening")) {
    return true;
  }
  return false;
}

/** Full center avatar with wake expansion (empty chat). */
export function shouldShowAmbientCenterAvatar(
  ambientEnabled: boolean,
  ambientState: AmbientAvatarState,
  hasMessages: boolean,
): boolean {
  if (!ambientEnabled || !isAmbientAwake(ambientState) || hasMessages) return false;
  if (ambientState === "miniOrb") return false;
  return ambientState === "awakening" || ambientState === "active";
}

const CHAT_ALIVE_PRIORITY = new Set<OrryonAliveState>([
  "listening",
  "thinking",
  "streaming",
  "speaking",
]);

/**
 * Merge ambient presence with chat/voice alive state for avatar glow.
 * Live chat or voice activity always wins; ambient awake keeps idle when chat is idle.
 */
export function resolveAmbientAliveState(
  ambientState: AmbientAvatarState,
  chatAlive: OrryonAliveState,
): OrryonAliveState {
  if (!isAmbientAwake(ambientState)) return chatAlive;
  if (CHAT_ALIVE_PRIORITY.has(chatAlive)) return chatAlive;
  return "idle";
}
