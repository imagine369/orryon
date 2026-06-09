import type { MessageSource } from "@/components/chat-input";
import type { FulfillmentHandoff } from "@/lib/fulfillment-types";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
  source?: MessageSource;
  /** Optional errand handoffs from create_fulfillment_handoff tool (Phase 1). */
  fulfillmentHandoffs?: FulfillmentHandoff[];
}

export interface ChatSession {
  id: string;
  title: string;
  preview: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}
