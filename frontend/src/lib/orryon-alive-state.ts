import type { VoiceStatus } from "@/components/chat-input";

export type OrryonAliveState =
  | "idle"
  | "listening"
  | "thinking"
  | "streaming"
  | "speaking";

/** Map chat + voice activity to avatar glow / breathe intensity. */
export function deriveOrryonAliveState(
  voiceStatus: VoiceStatus,
  streaming: boolean,
  thinking: boolean,
): OrryonAliveState {
  if (voiceStatus === "speaking") return "speaking";
  if (voiceStatus === "listening" || voiceStatus === "transcribing") return "listening";
  if (thinking || voiceStatus === "thinking") return "thinking";
  if (streaming) return "streaming";
  return "idle";
}
