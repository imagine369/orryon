import type { MessageSource } from "@/components/chat-input";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
  source?: MessageSource;
}

export interface ChatSession {
  id: string;
  title: string;
  preview: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}
