/** Chat streaming types and re-exports — transport lives in chat-transport.ts */

export interface PlanLimitDetail {
  code: "chat_limit_reached" | "usage_limit_reached";
  message: string;
  plan?: string;
  upgrade_plan?: string | null;
  messages_used?: number;
  limit?: number;
  spend_usd?: number;
  cap_usd?: number;
  kind?: string;
}

export interface ChatEvent {
  type:
    | "token"
    | "tool"
    | "done"
    | "error"
    | "session"
    | "retry"
    | "confirm_required";
  content?: string;
  name?: string;
  label?: string;
  message?: string;
  action?: string;
  args?: Record<string, unknown>;
  actions?: unknown[];
  tabs?: string[];
  undo_info?: { table: string; id: string; tool: string; label: string } | null;
  session_id?: string;
  voice_overlay?: boolean;
  limit?: PlanLimitDetail;
  reason?: string;
}

export {
  PlanLimitError,
  warmConnection,
  connectChatWs,
  disconnectChatWs,
  isChatWsConnected,
  streamChatMessage,
  streamChatAuto,
  streamChatSse,
  streamChat,
} from "@/lib/chat-transport";
